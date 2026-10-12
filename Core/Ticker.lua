-- One throttled per-frame driver for the whole addon. Work that runs every so
-- often (a range check five times a second, a clock once a second) asks
-- ns.Every instead of keeping its own OnUpdate and elapsed count. The one
-- frame's OnUpdate runs only while some job is registered.

local ADDON, ns = ...

-- Key -> its job: { key, period, fn, frame, elapsed, label, stopped }.
local jobs = {}
-- The jobs in the order they were added. Never changed in place (a change
-- puts a new list in), so a job started or stopped by another mid-frame
-- leaves the walk under way alone; a stopped job is skipped.
local order = {}
local driver = CreateFrame("Frame")
-- The driver frame, for a look at whether it runs (it has no OnUpdate while
-- idle) and at the jobs it holds (vgJobs, by key).
ns.ticker = driver
driver.vgJobs = jobs

-- Moves a job's time on by dt and runs it once a period is up. A job tied
-- to a frame counts time only while that frame is visible, as the frame's
-- own OnUpdate would.
local function advance(job, dt)
  if job.stopped or (job.frame and not job.frame:IsVisible()) then return end
  job.elapsed = job.elapsed + dt
  if job.elapsed < job.period then return end
  job.elapsed = 0
  ns.Try(job.label, job.fn, job.key)
end

-- The driver's OnUpdate: every job's time moves on, in the order they were added.
local function onUpdate(_, dt)
  for _, job in ipairs(order) do advance(job, dt) end
end

-- The label a job's failures are reported under: "ticker <key>", or the frame's name.
local function labelFor(key)
  if type(key) == "string" then return "ticker " .. key end
  local name = type(key) == "table" and type(key.GetName) == "function" and key:GetName()
  return "ticker " .. (name or "job")
end

-- Puts a new job list in; the driver's OnUpdate runs only while the list has a job.
local function setOrder(list)
  order = list
  driver:SetScript("OnUpdate", #list > 0 and onUpdate or nil)
end

-- Takes key's job off (a walk under way skips it).
local function stop(key)
  local job = jobs[key]
  if not job then return end
  job.stopped, jobs[key] = true, nil
  local list = {}
  for _, other in ipairs(order) do
    if other ~= job then list[#list + 1] = other end
  end
  setOrder(list)
end

-- A new job for key, last in the list, with `elapsed` seconds already counted.
local function start(key, elapsed)
  local job = { key = key, elapsed = elapsed, label = labelFor(key) }
  local list = {}
  for i, other in ipairs(order) do list[i] = other end
  list[#list + 1] = job
  jobs[key] = job
  setOrder(list)
  return job
end

-- Runs fn(key) every `seconds` (a string or a frame names the job); errors are
-- reported under "ticker <key>" (ns.Try) and the job goes on. With a frame,
-- time counts only while that frame is visible. With `now`, a new job runs on
-- its first (visible) frame instead of a period later. Asking again for a
-- running key changes its period, fn and frame and keeps its count;
-- ns.Every(key, nil) stops it.
function ns.Every(key, seconds, fn, frame, now)
  if not seconds then return stop(key) end
  local job = jobs[key] or start(key, now and seconds or 0)
  job.period, job.fn, job.frame = seconds, fn, frame
end
