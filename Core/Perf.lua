-- /vg perf: what Vanguard costs, from the game's own counters. Memory is
-- always counted; CPU time needs the game's script profiling (the
-- scriptProfile setting: on after a reload, and it slows every addon a little
-- while it's on). Every counter is looked up when used, so a client without
-- one simply leaves that number out.

local ADDON, ns = ...

local P = {}
ns.Perf = P

-- How often /vg perf watch prints (seconds), and how many functions the busiest list shows.
P.EVERY, P.TOP = 60, 10

-- The CPU total at the last report and when it was taken, for the change since.
local last = {}

-- The client's global function by name, or nil when it has none.
local function api(name)
  local fn = _G[name]
  return type(fn) == "function" and fn or nil
end

-- Whether the game's script profiling is on (the CPU numbers need it).
function P.Profiling()
  local get = (C_CVar and C_CVar.GetCVar) or api("GetCVar")
  return get ~= nil and tostring(get("scriptProfile")) == "1"
end

-- Vanguard's memory in KB, or nil when the client can't say.
function P.Memory()
  local update, get = api("UpdateAddOnMemoryUsage"), api("GetAddOnMemoryUsage")
  if not get then return nil end
  if update then update() end
  return ns.PlainNumber(get(ADDON))
end

-- Vanguard's CPU time in ms since profiling started, or nil (profiling off, or no counter).
function P.CPU()
  local update, get = api("UpdateAddOnCPUUsage"), api("GetAddOnCPUUsage")
  if not get or not P.Profiling() then return nil end
  if update then update() end
  return ns.PlainNumber(get(ADDON))
end

-- The CPU part of the report: the total, then the change since the last report and its rate.
local function cpuText(cpu, now)
  local text = string.format("CPU %.1f ms in all", cpu)
  if last.cpu and now > last.at then
    local spent = cpu - last.cpu
    text = text .. string.format(", +%.1f ms in the last %d s (%.2f ms/s)", spent, now - last.at, spent / (now - last.at))
  end
  last.cpu, last.at = cpu, now
  return text
end

-- Why there's no CPU number: profiling is off, it starts at the next reload, or the client has no counter.
local function noCpuText(cpu)
  if not P.Profiling() then return "CPU off (/vg perf cpu turns the game's profiling on)" end
  if cpu == 0 then return "CPU: profiling starts after a reload" end
  return "CPU: the client has no counter"
end

-- The memory part of the report.
local function memoryText()
  local kb = P.Memory()
  return kb and string.format("memory %.1f MB", kb / 1024) or "memory: the client can't say"
end

-- Adds every function in t to list as { "prefix" .. key, fn }.
local function addFunctions(list, prefix, t)
  for key, value in pairs(t) do
    if type(value) == "function" then list[#list + 1] = { prefix .. key, value } end
  end
end

-- Every named function of Vanguard: the namespace's, the theme's and each module's.
local function namedFunctions()
  local list = {}
  addFunctions(list, "ns.", ns)
  addFunctions(list, "Theme.", ns.Theme)
  for _, name in ipairs(ns.ModuleNames()) do addFunctions(list, name .. ".", ns.GetModule(name)) end
  return list
end

-- Most CPU time first; equal times by name.
local function busier(a, b)
  if a[2] ~= b[2] then return a[2] > b[2] end
  return a[1] < b[1]
end

-- The busiest named functions as { name, ms } (time in what they call included),
-- most first, at most P.TOP; empty without profiling or the counter.
function P.Top()
  local usage, list = api("GetFunctionCPUUsage"), {}
  if not usage or not P.Profiling() then return list end
  for _, f in ipairs(namedFunctions()) do
    local ms = ns.PlainNumber(usage(f[2], true))
    if ms and ms > 0 then list[#list + 1] = { f[1], ms } end
  end
  table.sort(list, busier)
  for i = #list, P.TOP + 1, -1 do list[i] = nil end
  return list
end

-- Prints Vanguard's CPU and memory now; with top, also its busiest functions.
function P.Report(top)
  local cpu, now = P.CPU(), api("GetTime") and GetTime() or 0
  local cpuPart = (cpu and cpu > 0) and cpuText(cpu, now) or noCpuText(cpu)
  ns.Chat(cpuPart .. "  ·  " .. memoryText())
  if not top then return end
  for i, f in ipairs(P.Top()) do ns.Chat(string.format("  %d. %s  %.1f ms", i, f[1], f[2])) end
end

-- /vg perf cpu: turns the game's script profiling on or off; it takes effect at the next reload.
function P.ToggleProfiling()
  local set = (C_CVar and C_CVar.SetCVar) or api("SetCVar")
  if not set then return ns.Chat("This client can't switch script profiling.") end
  local on = not P.Profiling()
  set("scriptProfile", on and "1" or "0")
  ns.OfferReload(on and "CPU profiling starts after a reload; it slows every addon a little, so /vg perf cpu again when you're done."
    or "CPU profiling stops after a reload.")
end

-- /vg perf watch: prints the report line every P.EVERY seconds, until asked again.
function P.Watch()
  if P.ticker then
    P.ticker:Cancel()
    P.ticker = nil
    return ns.Chat("Stopped printing Vanguard's CPU and memory.")
  end
  if not (C_Timer and C_Timer.NewTicker) then return ns.Chat("This client has no timers to print with.") end
  P.ticker = C_Timer.NewTicker(P.EVERY, function() P.Report(false) end)
  ns.Chat(string.format("Printing Vanguard's CPU and memory every %d s; /vg perf watch again stops.", P.EVERY))
end

-- /vg perf [cpu|watch]: the report now (with the busiest functions), profiling on or off, or the timed report.
function P.Command(rest)
  if rest == "cpu" then return P.ToggleProfiling() end
  if rest == "watch" then return P.Watch() end
  if rest ~= "" then return ns.Chat("Usage: /vg perf [cpu | watch]") end
  P.Report(true)
end
