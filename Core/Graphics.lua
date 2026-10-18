-- /vg graphics: a check of this computer and screen, and what it suggests. It
-- reads the graphics card the game sees (dedicated or low-power), the Graphics
-- Quality the game itself recommends for this computer (the slider's default,
-- which the game works out from the hardware), the Graphics Quality and render
-- scale in use and the screen size, measures the frame rate for a few seconds
-- (out of combat), and suggests a Graphics Quality and the setup sizes for the
-- screen. It only reads: the game's own Graphics Quality slider sets every
-- detail setting from it, which a lone setting change from an addon would not,
-- so the player moves the slider.

local ADDON, ns = ...

local G = {}
ns.Graphics = G

-- How many readings a check takes (one a second), the frame rates under which it suggests two steps
-- lower and from which one step higher, the highest step it suggests on a low-power (built-in) graphics
-- chip (0 to 9, shown as 1 to 10), and the screen height from which a lower render scale helps more.
G.TICKS, G.LOW, G.HIGH, G.LOW_POWER_MAX, G.TALL = 5, 30, 60, 4, 2000

-- The check under way: its timer and the readings so far.
local run

-- A client setting as a number (or its default with "default"), or nil when the client can't say.
---@param name string
---@param default boolean|nil
---@return number|nil
function G.Setting(name, default)
  local get = default and ((C_CVar and C_CVar.GetCVarDefault) or _G.GetCVarDefault) or ((C_CVar and C_CVar.GetCVar) or _G.GetCVar)
  if type(get) ~= "function" then return nil end
  local ok, v = pcall(get, name)
  return ok and tonumber(v) or nil
end

-- The graphics card the game lists first, as { name, lowPower }, or nil when the client can't say.
function G.Card()
  local get = C_VideoOptions and C_VideoOptions.GetGxAdapterInfo
  local ok, list = pcall(type(get) == "function" and get or error)
  local card = ok and type(list) == "table" and list[1]
  if type(card) ~= "table" or type(card.name) ~= "string" then return nil end
  return { name = card.name, lowPower = card.isLowPower == true }
end

-- The frame rate now, or nil when the client can't say.
local function framerate()
  local get = _G.GetFramerate
  return type(get) == "function" and ns.PlainNumber(get()) or nil
end

-- The Graphics Quality step (0 to 9) to suggest: the game's own recommendation (else the one in use),
-- two below the one in use under G.LOW fps, one above it from G.HIGH, never above G.LOW_POWER_MAX on a
-- low-power chip.
---@param avg number
---@param quality number
---@param recommended number|nil
---@param lowPower boolean
---@return number
function G.Suggest(avg, quality, recommended, lowPower)
  local q = recommended or quality
  if avg < G.LOW then q = math.min(q, quality - 2) elseif avg >= G.HIGH then q = math.max(q, quality + 1) end
  if lowPower then q = math.min(q, G.LOW_POWER_MAX) end
  return math.max(0, math.min(9, q))
end

-- What the check says about Graphics Quality: lower it, raise it, or leave it (steps shown as 1 to 10).
---@param avg number
---@param quality number|nil
---@param recommended number|nil
---@param lowPower boolean
---@return string
function G.Advice(avg, quality, recommended, lowPower)
  if not quality then return "Graphics Quality can't be read on this client; if the game feels slow, lower it in Options → Graphics." end
  local q = G.Suggest(avg, quality, recommended, lowPower)
  if q < quality then return string.format("Suggested: lower Graphics Quality to %d in Options → Graphics (the slider sets every detail for you).", q + 1) end
  if q > quality then return string.format("Suggested: Graphics Quality %d in Options → Graphics; this computer has room for it.", q + 1) end
  return "Your Graphics Quality suits this computer and screen."
end

-- A tip for a tall (4K) screen that runs slow: the render scale saves the most there.
function G.RenderTip(avg, h, render)
  if avg >= G.LOW or (tonumber(h) or 0) < G.TALL or not render or render < 0.9 then return nil end
  return "On a 4K screen, Render Scale 80% in Options → Graphics helps the frame rate most, with little change in sharpness."
end

-- The screen's size in pixels, or 0, 0 when the client can't say.
function G.ScreenSize()
  local get = _G.GetPhysicalScreenSize
  if type(get) ~= "function" then return 0, 0 end
  local w, h = get()
  return tonumber(w) or 0, tonumber(h) or 0
end

-- The screen line: its size and the sizes setup suggests for it.
function G.ScreenLine()
  local S, w, h = ns.Setup, G.ScreenSize()
  local p = S.ScreenPreset(S.DetectScreen())
  local suggest = p and string.format("the %s sizes (UI scale %d%%)", p.text, math.floor(p.ui * 100 + 0.5)) or "Pixel-perfect"
  return string.format("Screen %d x %d: setup suggests %s; /vg setup, then Screen, applies it.", w, h, suggest)
end

-- The average of a list of numbers.
local function average(list)
  local sum = 0
  for _, v in ipairs(list) do sum = sum + v end
  return sum / #list
end

-- A Graphics Quality step (0 to 9) as the slider shows it (1 to 10), or "unknown".
local function step(v)
  return v and tostring(v + 1) or "unknown"
end

-- The computer line: the graphics card, the game's recommended Graphics Quality and the one in use, and the render scale.
local function computerLine(card, quality, recommended, render)
  local kind = card and (card.lowPower and " (built-in, low power)" or " (dedicated)") or ""
  return string.format("Graphics card: %s%s. Graphics Quality %s of 10 (the game recommends %s for this computer), render scale %s.",
    card and card.name or "unknown", kind, step(quality), step(recommended), render and math.floor(render * 100 + 0.5) .. "%" or "unknown")
end

-- Prints the result: the frame rate, the computer, the suggestion, the screen and, on a slow 4K screen, the render scale tip.
local function report(avg, n)
  local card, quality, recommended, render = G.Card(), G.Setting("graphicsQuality"), G.Setting("graphicsQuality", true), G.Setting("renderScale")
  ns.Chat(string.format("Frame rate: %d fps on average over %d s.", math.floor(avg + 0.5), n))
  ns.Chat(computerLine(card, quality, recommended, render))
  ns.Chat(G.Advice(avg, quality, recommended, card ~= nil and card.lowPower))
  ns.Chat(G.ScreenLine())
  local tip = G.RenderTip(avg, select(2, G.ScreenSize()), render)
  if tip then ns.Chat(tip) end
end

-- Ends the check and reports it (or says it has no readings).
local function finish()
  local r = run
  run = nil
  r.ticker:Cancel()
  if #r.fps == 0 then return ns.Chat("Frame rate check: no readings (none are taken in combat). Try again out of combat.") end
  report(average(r.fps), #r.fps)
end

-- One timer call: a reading (none in combat), and the end of the check after the last.
local function tick()
  run.ticks = run.ticks + 1
  local fps = not ns.InCombat() and framerate()
  if fps then run.fps[#run.fps + 1] = fps end
  if run.ticks >= G.TICKS then finish() end
end

-- /vg graphics: starts a check (not in combat), or ends the one under way early with what it has.
function G.Command()
  if run then return finish() end
  if ns.InCombat() then return ns.Chat("The check waits for the end of the fight: try /vg graphics again then.") end
  if not (C_Timer and C_Timer.NewTicker) then return ns.Chat("This client has no timers to measure with.") end
  run = { fps = {}, ticks = 0 }
  run.ticker = C_Timer.NewTicker(1, ns.Guard("timer graphics check", tick))
  ns.Chat(string.format("Checking this computer and your frame rate for %d s: stand where you usually play (a city is slower than the open world). /vg graphics again ends it early.", G.TICKS))
end
