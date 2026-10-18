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
-- How many KB the low point of a memory run may rise before it counts as memory kept (readings wobble).
P.KEPT = 50

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

-- Vanguard's memory in KB, or nil when the client can't say or the player is in
-- combat (the game's memory counter is never refreshed in a fight).
function P.Memory()
  local update, get = api("UpdateAddOnMemoryUsage"), api("GetAddOnMemoryUsage")
  if not get or ns.InCombat() then return nil end
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
  if kb then return string.format("memory %.1f MB", kb / 1024) end
  return ns.InCombat() and "memory: not read in combat" or "memory: the client can't say"
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

-- The always-on profiler's metrics (AddOnProfilerConstantsDocumentation.lua's AddOnProfilerMetric):
-- the average over the last 60 frames, since login, the highest, and how many frames took over 5 ms.
P.METRICS = { RecentAverageTime = 1, SessionAverageTime = 0, PeakTime = 4, CountTimeOver5Ms = 6 }

-- The game's always-on addon profiler (C_AddOnProfiler, on WoW Forever and Retail; no script
-- profiling needed), or nil where the client has none or has it off.
function P.Profiler()
  local p = C_AddOnProfiler
  if type(p) ~= "table" or type(p.GetAddOnMetric) ~= "function" then return nil end
  if type(p.IsEnabled) == "function" and not p.IsEnabled() then return nil end
  return p
end

-- One profiler metric by name (the client's Enum value, else the documented one), 0 when hidden.
local function metric(get, name)
  local enum = Enum and Enum.AddOnProfilerMetric
  return ns.PlainNumber(get((enum and enum[name]) or P.METRICS[name])) or 0
end

-- The profiler's CPU part: ms a frame now, on average and at most, its share of all addons' time now
-- (when the client gives the total) and how many frames took over 5 ms; nil without the profiler.
function P.ProfilerText()
  local p = P.Profiler()
  if not p then return nil end
  -- Vanguard's own value of metric m.
  local function mine(m) return p.GetAddOnMetric(ADDON, m) end
  local recent, all = metric(mine, "RecentAverageTime"), type(p.GetOverallMetric) == "function" and metric(p.GetOverallMetric, "RecentAverageTime") or 0
  local share = all > 0 and string.format(", %.0f %% of all addons", recent / all * 100) or ""
  return string.format("CPU %.2f ms a frame now (%.2f on average, peak %.1f ms%s; %d frames over 5 ms)",
    recent, metric(mine, "SessionAverageTime"), metric(mine, "PeakTime"), share, metric(mine, "CountTimeOver5Ms"))
end

-- The report's CPU part: the always-on profiler's, else the script profiler's total, else why there's none.
local function cpuPart()
  local text = P.ProfilerText()
  if text then return text end
  local cpu, now = P.CPU(), api("GetTime") and GetTime() or 0
  return (cpu and cpu > 0) and cpuText(cpu, now) or noCpuText(cpu)
end

-- Prints Vanguard's CPU and memory now; with top, also its busiest functions (those need script profiling).
function P.Report(top)
  ns.Chat(cpuPart() .. "  ·  " .. memoryText())
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
  P.ticker = C_Timer.NewTicker(P.EVERY, ns.Guard("timer perf report", function() P.Report(false) end))
  ns.Chat(string.format("Printing Vanguard's CPU and memory every %d s; /vg perf watch again stops.", P.EVERY))
end

-- /vg perf slow -----------------------------------------------------------------------------

-- Longest call first; equal ones by the most slow calls, then by name.
local function slower(a, b)
  if a.longest ~= b.longest then return a.longest > b.longest end
  if a.slow ~= b.slow then return a.slow > b.slow end
  return a.where < b.where
end

-- Every timed site (ns.timings) as { where, calls, total, longest, slow }, the slowest first.
function P.Slowest()
  local list = {}
  for where, t in pairs(ns.timings) do
    list[#list + 1] = { where = where, calls = t.calls, total = t.total, longest = t.longest, slow = t.slow }
  end
  table.sort(list, slower)
  return list
end

-- /vg perf slow [reset]: Vanguard's slowest handlers since login (or the last reset), each with its
-- longest call, how many calls took over ns.SLOW_MS, and its time in all; reset starts the count over.
function P.SlowCommand(rest)
  if rest == "reset" then ns.timings, ns.timingCount = {}, 0 return ns.Chat("Vanguard's handler timings start over.") end
  local list = P.Slowest()
  if #list == 0 then return ns.Chat("No handler timings yet (the client has no fine clock, or nothing has run).") end
  ns.Chat(string.format("Vanguard's slowest handlers since login or /vg perf slow reset (calls over %d ms):", ns.SLOW_MS))
  for i = 1, math.min(P.TOP, #list) do
    local t = list[i]
    ns.Chat(string.format("  %d. %s  longest %.1f ms, %d over %d ms, %d calls, %.0f ms in all", i, t.where, t.longest, t.slow, ns.SLOW_MS, t.calls, t.total))
  end
end

-- /vg perf [cpu|watch|slow]: the report now (with the busiest functions), profiling on or off, the timed
-- report, or the slowest handlers.
function P.Command(rest)
  if rest == "cpu" then return P.ToggleProfiling() end
  if rest == "watch" then return P.Watch() end
  if rest == "slow" or rest == "slow reset" then return P.SlowCommand(rest:sub(6)) end
  if rest ~= "" then return ns.Chat("Usage: /vg perf [cpu | watch | slow [reset]]") end
  P.Report(true)
end

-- /vg mem ---------------------------------------------------------------------------------

-- A memory run samples every P.MEM_EVERY seconds for P.MEM_TICKS samples (a minute).
P.MEM_EVERY, P.MEM_TICKS = 5, 12

-- The run under way: { kb = samples in KB, live = the first after a garbage collection (nil when the client
-- refused it), ticks = timer calls so far, at = start time, ticker }; nil when none.
local run

-- The smallest of the samples from i to j.
local function lowest(kb, i, j)
  local low = kb[i]
  for k = i + 1, j do low = math.min(low, kb[k]) end
  return low
end

-- How far the low point moved from the first half of the run to the second, in KB: memory
-- that stays after the game has cleared the garbage. nil under four samples.
local function floorChange(kb)
  local n = #kb
  if n < 4 then return nil end
  return lowest(kb, math.floor(n / 2) + 1, n) - lowest(kb, 1, math.ceil(n / 2))
end

-- What the low point's move means: kept memory, or only garbage the game collects.
local function floorText(change)
  if not change then return "Too few readings to tell garbage from kept memory (readings are skipped in combat)." end
  if change > P.KEPT then return string.format("The low point rose %.0f KB: Vanguard is keeping memory (data that grows, or that is never let go).", change) end
  return "The low point held: the rise and fall is garbage the game collects, not memory kept."
end

-- What the run's two clean readings say: live memory at the start and the end, and what was kept.
local function liveText(from, to)
  local kept = to - from
  local verdict = kept > P.KEPT and "Vanguard kept memory it hasn't let go." or "nothing kept: the rest was garbage."
  return string.format("After a garbage collection: %.2f MB at the start, %.2f MB at the end (%+.0f KB); %s", from / 1024, to / 1024, kept, verdict)
end

-- The memory run's result, as two chat lines: the readings, then what the clean readings (else the low point) say.
local function memReport(r, now, liveEnd)
  local kb, secs = r.kb, math.max(1, now - r.at)
  if #kb < 2 then return ns.Chat("Vanguard's memory: too few readings (the game's counter is not read in combat).") end
  local grew = kb[#kb] - kb[1]
  ns.Chat(string.format("Vanguard's memory over %d s: %.2f MB to %.2f MB (%+.0f KB, %+.1f KB/s), low %.2f, high %.2f MB.",
    secs, kb[1] / 1024, kb[#kb] / 1024, grew, grew / secs, lowest(kb, 1, #kb) / 1024, math.max(unpack(kb)) / 1024))
  ns.Chat((r.live and liveEnd) and liveText(r.live, liveEnd) or floorText(floorChange(kb)))
end

-- Lua's own memory in KB after a full garbage collection (a short hitch), or nil: never in combat, nor
-- where the client refuses the collection. Without it the game's counter holds garbage not yet freed.
function P.LiveMemory()
  if ns.InCombat() or not pcall(collectgarbage, "collect") then return nil end
  return P.Memory()
end

-- Ends the run: the timer stops, a clean reading is taken (out of combat) and the result prints.
local function memFinish()
  local r = run
  run = nil
  r.ticker:Cancel()
  memReport(r, GetTime(), r.live and P.LiveMemory())
end

-- One timer call: a reading (none in combat), and the end of the run after its last.
local function memTick()
  run.ticks = run.ticks + 1
  local kb = P.Memory()
  if kb then run.kb[#run.kb + 1] = kb end
  if run.ticks >= P.MEM_TICKS then memFinish() end
end

-- /vg mem: starts a one-minute memory run (a reading now and every few seconds), or ends the one
-- under way early with what it has. Stay out of combat: the game's counter is not read in a fight.
function P.MemCommand()
  if run then return memFinish() end
  ns.SettingsGuard.SizeReport()
  if not (C_Timer and C_Timer.NewTicker) then return ns.Chat("This client has no timers to measure with.") end
  local live = P.LiveMemory()
  local kb = live or P.Memory()
  if not kb then return ns.Chat("Vanguard's memory can't be read " .. (ns.InCombat() and "in combat; try again out of combat." or "on this client.")) end
  run = { kb = { kb }, live = live, ticks = 0, at = GetTime() }
  run.ticker = C_Timer.NewTicker(P.MEM_EVERY, ns.Guard("timer memory run", memTick))
  ns.Chat(string.format("Measuring Vanguard's memory for %d s (a reading every %d s). Stand still out of combat; /vg mem again ends it early.", P.MEM_EVERY * P.MEM_TICKS, P.MEM_EVERY))
end
