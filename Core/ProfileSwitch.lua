-- Live profile switching (docs/design/MODULE-LIFECYCLE.md, 2.9): a profile picked mid-session applies at once when
-- nothing that waits for a reload would differ, all or nothing; otherwise it is staged for the reload as before
-- (ns.StageProfile, Core/DB.lua) and the reload offer names the modules that differ. A reload-only module counts as
-- different unless it declares rebinds = true (it reads its settings only through def.settings, which the switch
-- points at the new profile's table) and its switch and settings are the same in both profiles.

local ADDON, ns = ...
local L = ns.L

-- A setting's value as a table holds it (a saved false included), or its default when it holds none.
local function valueOf(t, defaults, key)
  local v = nil
  if type(t) == "table" then v = t[key] end
  if v == nil and type(defaults) == "table" then v = defaults[key] end
  return v
end

local same

-- Whether two values are the same: tables key by key (their defaults filled in), anything else by ==.
local function sameValue(x, y, defaults)
  if type(x) == "table" and type(y) == "table" then return same(x, y, defaults) end
  return x == y
end

-- Whether a and b agree on every key that src holds, with defaults filled in on both sides.
local function sameKeys(src, a, b, defaults)
  for key in pairs(src) do
    local sub = type(defaults) == "table" and defaults[key] or nil
    if not sameValue(valueOf(a, defaults, key), valueOf(b, defaults, key), sub) then return false end
  end
  return true
end

-- Whether two settings tables hold the same settings, deep, with defaults filled in on both sides.
function same(a, b, defaults)
  return sameKeys(a or {}, a, b, defaults) and sameKeys(b or {}, a, b, defaults) and sameKeys(defaults or {}, a, b, defaults)
end

-- Whether a profile has a module switched on (on unless turned off).
local function switchedOn(profile, name)
  local switches = profile.modules
  return not (type(switches) == "table" and switches[name] == false)
end

-- Whether a reload-only module keeps the switch from applying now: its switch differs (it would have to be built or
-- taken down), or it runs and its settings differ, or it runs and can't be pointed at new settings (no rebinds).
-- Returns blocks, differs.
local function blocks(def, now, nxt)
  if switchedOn(now, def.name) ~= switchedOn(nxt, def.name) then return true, true end
  if not ns.ModuleLive(def.name) then return false, false end
  if not same(now[def.name], nxt[def.name], def.defaults) then return true, true end
  return def.rebinds ~= true, false
end

-- Whether the theme settings that show only after a reload (O.RELOAD_THEME, and the variant, which can turn Safer
-- colours on or off) differ between the two profiles.
local function themeDiffers(now, nxt)
  local T = ns.Theme
  for _, key in ipairs(ns.Options.RELOAD_THEME) do
    if not sameValue(valueOf(now.theme, T.DEFAULTS, key), valueOf(nxt.theme, T.DEFAULTS, key)) then return true end
  end
  return not sameValue(valueOf(now.theme, T.DEFAULTS, "variant"), valueOf(nxt.theme, T.DEFAULTS, "variant"))
end

-- What keeps the profile `name` from applying now, in load order: every reload-only module that blocks, and "theme"
-- when its reload settings differ. Returns all of them, and those whose switch or settings differ.
---@param name string
---@return string[] blockers, string[] differing
function ns.SwitchBlockers(name)
  local now, nxt = ns.Profile(), VanguardDB.profiles[name] or {}
  local blockers, differing = {}, {}
  for _, module in ipairs(ns.ModuleNames()) do
    local def = ns.GetModule(module)
    local block, differs = blocks(def, now, nxt)
    if def.Enable and not def.live and block then blockers[#blockers + 1] = module end
    if def.Enable and not def.live and differs then differing[#differing + 1] = module end
  end
  if themeDiffers(now, nxt) then blockers[#blockers + 1], differing[#differing + 1] = "theme", "theme" end
  return blockers, differing
end

-- The sentence a reload offer adds for a staged profile: which modules differ, when they alone keep it from applying
-- now (switched back, the profile would apply at once). Nil when nothing differs or other modules block it anyway
-- (a reload-only module that can't take new settings yet: naming the ones that differ would mislead).
---@param name string
---@return string|nil
function ns.SwitchWaitText(name)
  local blockers, differing = ns.SwitchBlockers(name)
  if #differing == 0 or #differing < #blockers then return nil end
  local names = {}
  for i, module in ipairs(differing) do names[i] = module == "theme" and L["the theme"] or ns.Options.ModuleTitle(module) end
  local values = { modules = table.concat(names, ", "), profile = name }
  if #names == 1 then return ns.Format(L["{modules} differs in {profile}, so the switch waits for a reload."], values) end
  return ns.Format(L["{modules} differ in {profile}, so the switch waits for a reload."], values)
end

-- Points each reload-only module that declares rebinds at its settings in the profile now in use.
local function rebind()
  for _, module in ipairs(ns.ModuleNames()) do
    local def = ns.GetModule(module)
    if def.rebinds and def.settings ~= nil then def.settings = ns.Settings(module, def.defaults) end
  end
end

-- Switches to the profile now: live modules down, the profile in use changed (the settings cache with it), the
-- rebinding modules re-pointed, every frame placed for the new profile, the theme repainted, the live modules the new
-- profile wants started.
local function switchNow(name)
  ns.StopLiveModules()
  VanguardCharDB.profile, VanguardCharDB.pendingProfile = name, nil
  ns.ProfileChanged()
  rebind()
  for _, mover in ipairs(ns.MoverList()) do ns.PlaceMover(mover.key) end
  ns.Theme.Refresh()
  ns.SettleModules()
  ns.ProfileStagedChanged()
end

-- A profile the player picked (the profile list, the window's picker, /vg profile): it applies at once when it can
-- (ns.SwitchProfileNow), else it is staged as ns.UseProfile stages it. An import or a restored backup goes through
-- ns.UseProfile and always waits for the reload. Returns true when the profile applied at once.
---@param name string
---@return boolean switched
function ns.PickProfile(name)
  VanguardDB.profiles[name] = VanguardDB.profiles[name] or {}
  if ns.SwitchProfileNow(name) then
    VanguardCharDB.ownProfile = name
    ns.WarnSpecWins(name)
    return true
  end
  ns.UseProfile(name)
  return false
end

-- Switches to the profile `name` now when it can: after the login pass, out of combat, another profile than the one in
-- use, and nothing blocking it (ns.SwitchBlockers). Returns true when it switched; false leaves staging to the caller.
---@param name string
---@return boolean switched
function ns.SwitchProfileNow(name)
  if not ns.ModulesBuilt() or ns.InCombat() or name == ns.ProfileName() then return false end
  if #ns.SwitchBlockers(name) > 0 then return false end
  switchNow(name)
  return true
end
