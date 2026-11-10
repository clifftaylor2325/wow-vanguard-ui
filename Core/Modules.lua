-- Modules: each feature (unit frames, action bars, ...) registers itself here
-- and is enabled at PLAYER_LOGIN unless the profile turns it off. A module
-- that errors is reported (chat, /vg errors, the game's error handler) and
-- skipped; the others still load. A module that declares live = true also goes on
-- and off mid-session, out of combat, its parents first (docs/design/MODULE-LIFECYCLE.md);
-- one that declares nothing, or reload = L["why"], waits for a reload as before.

local ADDON, ns = ...

local modules, order = {}, {}
-- An empty list, for a module that requires nothing.
local NONE = {}

-- Which client this load runs on, "forever" or "retail", decided once (ns.IsForever, Core/Combat.lua).
local client

-- The running client's key in a { forever = ..., retail = ... } table.
local function clientKey()
  client = client or (ns.IsForever() and "forever" or "retail")
  return client
end

-- The running client's key: "forever" or "retail".
---@return string
function ns.ClientKey()
  return clientKey()
end

-- The settings that start differently on each client, by module (a nested table follows the settings'
-- own): one place for the module defaults and for an import to tell a value left at the other client's
-- default from a choice (ns.WithoutOtherClientDefaults, Core/ProfileStrings.lua).
ns.CLIENT_DEFAULTS = {
  UnitFrames = { showLevel = { forever = true, retail = false }, healthFormat = { forever = "percent", retail = "value" } },
  -- Retail starts with no bandage row (its players rarely carry them); /vg prep want bandages <n> turns it on.
  InstancePrep = { want = { bandages = { forever = 10, retail = 0 } } },
}

-- Whether a module belongs on the running client: def.clients = { forever = true } or { retail = true }
-- names the only clients it has; without def.clients it has both. The one place that decides it.
---@param def { clients: table? }
---@return boolean
function ns.ClientAllows(def)
  return def.clients == nil or def.clients[clientKey()] == true
end

-- The running client's entry of a per-client table: tbl.forever on WoW Forever, tbl.retail on Retail.
---@param tbl { forever: any, retail: any }
---@return any
function ns.ClientData(tbl)
  return tbl[clientKey()]
end

-- Reports each module in def.requires that is not registered before it: Vanguard.toc lists a parent first, so
-- the login pass and every settle build it before the modules that need it.
local function checkRequires(def)
  for _, parent in ipairs(def.requires or NONE) do
    if modules[parent] == nil then ns.Report("module " .. def.name, "requires " .. parent .. ", which is not registered before it") end
  end
end

-- Registers a module. def.defaults = its settings; def.Enable(settings, scope) builds it (scope: Core/ModuleScope.lua,
-- for a module that declares live or reload; nil otherwise); def.clients limits it to some clients
-- (ns.ClientAllows). def.requires names the modules whose frames it needs (each registered before it); def.live =
-- true says it goes on and off at once, def.reload = L["why"] says why it waits for a reload (neither: it waits, as
-- every module did before); def.afterOff = L["what stays"] is the line a live module prints when it stops. Returns
-- def so the module file can add functions to it. On a client it isn't for, nothing is registered: ns.GetModule
-- gives nil, ns.ModuleNames leaves it out, it is never built, and its options rows and /vg words don't show.
---@param name string
---@param def {defaults: table?, clients: table?, requires: table?, live: boolean?, reload: string?, afterOff: string?, Enable: function?, Disable: function?}
---@return table def  the same table, with name set
function ns.Module(name, def)
  def.name = name
  if not ns.ClientAllows(def) then return def end
  checkRequires(def)
  modules[name] = def
  order[#order + 1] = name
  return def
end

-- The module registered under name, or nil.
---@param name string
---@return table|nil
function ns.GetModule(name)
  return modules[name]
end

-- Module names in load order.
---@return string[]
function ns.ModuleNames()
  return { unpack(order) }
end

-- Whether the profile has the module on (on unless turned off).
---@param name string
---@return boolean
function ns.ModuleEnabled(name)
  local enabled = ns.Settings("modules")
  return enabled[name] ~= false
end

-- Whether every module def requires passes test(name).
local function parentsPass(def, test)
  for _, parent in ipairs(def.requires or NONE) do
    if not test(parent) then return false end
  end
  return true
end

-- Whether a module should run: its own switch on, and every module it requires wanted too.
---@param name string
---@return boolean
function ns.ModuleWanted(name)
  return modules[name] ~= nil and ns.ModuleEnabled(name) and parentsPass(modules[name], ns.ModuleWanted)
end

-- Whether a module's frames are on screen this session: built (at login, or since by a live switch), or, while the
-- login pass has not reached it yet, wanted. For code that places itself against another module's frames.
---@param name string
---@return boolean
function ns.ModuleLive(name)
  local def = modules[name]
  if def == nil then return false end
  if def.enabled == nil then return ns.ModuleWanted(name) end
  return def.enabled == true
end

-- The lifecycle (docs/design/MODULE-LIFECYCLE.md) --------------------------------------------------------------
-- built: the login pass has run (nothing settles before it); queued: a settle waits for the fight to end; restarts:
-- the live modules to build again at the next settle (ns.RestartModule).
local life = { built = false, queued = false, restarts = {}, KEY = "module lifecycle" }

-- Whether a module is built and running now.
local function running(def)
  return def.enabled == true
end

-- Whether a module it requires is running now (a live parent started earlier in the same pass counts).
local function parentRunning(name)
  return modules[name] ~= nil and running(modules[name])
end

-- Whether a module may start: wanted, and every module it requires running already.
local function startable(def)
  return ns.ModuleWanted(def.name) and parentsPass(def, parentRunning)
end

local keeps

-- Whether a parent keeps its children running: a live one while it stays on itself, a reload-only one while it is
-- built (its frames only go with the reload, so a live child stays with them until then).
local function parentKeeps(name)
  local def = modules[name]
  if def and def.live then return keeps(name) end
  return def ~= nil and running(def)
end

-- Whether a running module stays on: its own switch on, and every parent keeping it.
function keeps(name)
  return ns.ModuleEnabled(name) and parentsPass(modules[name], parentKeeps)
end

-- Reads a module's settings (running its ns.Migrate upgrade) and builds it, handing it its scope (or nil).
local function build(def)
  return def.Enable(ns.Settings(def.name, def.defaults), def.scope)
end

-- Opens the scope of a module that declares live or reload (Core/ModuleScope.lua; made on its first start and kept
-- for the session, so its gates and spare frames survive a stop). A module that declares neither gets none.
local function openScope(def)
  if not (def.live or def.reload) then return end
  def.scope = def.scope or ns.NewScope(def.name)
  def.scope:Open()
end

-- Releases what a module that failed to build registered through its scope: its gates shut at once, the rest out of
-- combat (a /reload in a fight runs the login pass in combat, and hiding a secure frame is protected).
-- Its own Disable runs too (under ns.Try), for what it did outside the scope before it failed. The module is marked
-- failed: no settle builds it again until its own switch or one of its settings changes.
local function releaseFailed(def)
  def.scope.on, def.failed = false, true
  ns.OutOfCombat(function()
    if def.Disable then ns.Try("disable " .. def.name, def.Disable, ns.Settings(def.name, def.defaults)) end
    def.scope:Close()
  end, def.scope)
end

-- Builds one module; a failure, in its settings' upgrade too, is reported (see ns.Report) instead of stopping the
-- others, and what it registered through its scope before it failed is released.
local function start(def)
  openScope(def)
  def.enabled = (ns.Try("module " .. def.name, build, def))
  if not def.enabled and def.scope then releaseFailed(def) end
end

-- Takes a running live module down: its own Disable first (what the scope can't see), then its scope. Either may
-- fail (reported); the module is off all the same, so the settle goes on.
local function takeDown(def)
  if def.Disable then ns.Try("disable " .. def.name, def.Disable, ns.Settings(def.name, def.defaults)) end
  ns.Try("stop " .. def.name, def.scope.Close, def.scope)
  def.enabled = false
end

-- A live module switched off: taken down, and the line it declared about what stays until a reload, if any.
local function stop(def)
  takeDown(def)
  if def.afterOff then ns.Chat(def.afterOff) end
end

-- The first half of a settle, in reverse load order (dependents before their parents): a live module asked to
-- rebuild is taken down, and one that should no longer run stops.
local function stopPass()
  for i = #order, 1, -1 do
    local def = modules[order[i]]
    if def.live and running(def) and life.restarts[def.name] then takeDown(def)
    elseif def.live and running(def) and not keeps(def.name) then stop(def) end
  end
end

-- The second half, in load order (parents first): every live module that may start and is not running starts.
local function startPass()
  for _, name in ipairs(order) do
    local def = modules[name]
    if def.live and def.Enable and not def.failed and not running(def) and startable(def) then start(def) end
  end
end

local changedListeners = {}

-- Registers fn() to run after the module switches settled (whether or not a live module started or stopped).
---@param fn fun()
function ns.OnModulesChanged(fn)
  changedListeners[#changedListeners + 1] = ns.Guard("modules changed", fn)
end

-- Tells every ns.OnModulesChanged listener that the module switches settled.
function ns.ModulesChanged()
  for _, fn in ipairs(changedListeners) do fn() end
end

-- Settles every live module to the switches (out of combat), then tells the listeners.
local function settle()
  life.queued = false
  stopPass()
  life.restarts = {}
  startPass()
  ns.ModulesChanged()
end

-- Asks for a settle: now, or when the fight ends (switches made in a fight add up to one pass, and a start may build
-- secure frames, a stop hide them). Nothing settles before the login pass has built the modules.
function ns.SettleModules()
  if not life.built then return end
  life.queued = ns.InCombat()
  ns.OutOfCombat(settle, life.KEY)
end

-- Turns a module on or off for this profile. A live module (and the live modules that need it) goes on or off at
-- once, or when the fight ends; any other waits for the reload, except that one with a Disable(settings) gives
-- back what it changed at once.
---@param name string
---@param on boolean
function ns.SetModuleEnabled(name, on)
  ns.Settings("modules")[name] = on and true or false
  local def = modules[name]
  if def then def.failed = nil end
  if not on and def and def.Disable and not def.live then ns.Try("disable " .. name, def.Disable, ns.Settings(name, def.defaults)) end
  ns.SettleModules()
end

-- Builds a running live module again, out of combat (a setting that changes its shape: O.RestartSetting); one whose
-- start failed is tried again. Any other module is left alone: its settings apply at the reload.
---@param name string
function ns.RestartModule(name)
  local def = modules[name]
  if not (def and def.live) then return end
  if def.failed then def.failed = nil return ns.SettleModules() end
  if not running(def) then return end
  life.restarts[name] = true
  ns.SettleModules()
end

-- Whether a live module's switch, or its rebuild, waits for the fight to end (the options row says so).
---@param name string
---@return boolean
function ns.ModuleAwaitsFight(name)
  local def = modules[name]
  if not (life.queued and def and def.live) then return false end
  if running(def) then return life.restarts[name] == true or not keeps(name) end
  return startable(def)
end

-- Whether a module waits for a reload: a reload-only one whose wanted state changed since login, or a live one kept
-- running by a reload-only parent that was switched off.
local function waiting(def)
  if def.live then return not life.queued and running(def) and not ns.ModuleWanted(def.name) end
  return def.Enable ~= nil and def.wantedAtLogin ~= nil and def.wantedAtLogin ~= ns.ModuleWanted(def.name)
end

-- The modules whose switch waits for a reload, in load order (the options window's reload notice names them).
---@return string[]
function ns.ModulesWaiting()
  local out = {}
  for _, name in ipairs(order) do
    if waiting(modules[name]) then out[#out + 1] = name end
  end
  return out
end

-- True once the login pass has built the modules.
---@return boolean
function ns.ModulesBuilt()
  return life.built
end

-- Takes every running live module down, dependents first (a live profile switch, Core/ProfileSwitch.lua, then
-- settles to the new profile's switches).
function ns.StopLiveModules()
  for i = #order, 1, -1 do
    local def = modules[order[i]]
    if def.live and running(def) then stop(def) end
  end
end

-- The login pass, one module: noted as wanted or not (ns.ModulesWaiting compares), then built when it may start.
local function loginStart(def)
  def.wantedAtLogin = ns.ModuleWanted(def.name)
  if def.Enable and startable(def) then
    start(def)
  else
    def.enabled = false
  end
end

ns.On("PLAYER_LOGIN", function()
  for _, name in ipairs(order) do loginStart(modules[name]) end
  life.built = true
end)
