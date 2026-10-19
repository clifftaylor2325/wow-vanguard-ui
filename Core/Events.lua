-- One event frame for the whole addon. Modules subscribe with ns.On
-- instead of creating their own frames.

local ADDON, ns = ...

-- "Vanguard:" in the accent color (plain until the theme has loaded).
local function chatPrefix()
  local T = ns.Theme
  return T and T.Paint("Vanguard:", "accentText") .. " " or "Vanguard: "
end

-- Prints one line to the default chat frame, prefixed with the addon name.
---@param msg string
function ns.Chat(msg)
  if DEFAULT_CHAT_FRAME then
    DEFAULT_CHAT_FRAME:AddMessage(chatPrefix() .. msg)
  end
end

-- Sends a message to a chat channel ("PARTY", "RAID", ...) for other players to read, through
-- C_ChatInfo.SendChatMessage; the old SendChatMessage global is only a deprecation fallback on
-- Forever (Blizzard_DeprecatedChatInfo, gone when the game drops its fallbacks), so it is used
-- only on a client without the C_ChatInfo call.
---@param text string
---@param chatType string
function ns.SendChat(text, chatType)
  local send = C_ChatInfo and C_ChatInfo.SendChatMessage or SendChatMessage
  send(text, chatType)
end

-- Adds fn as the game's chat message filter for each event. The old global is only an alias of
-- ChatFrameUtil.AddMessageEventFilter, there while the client loads its deprecation fallbacks
-- (Deprecated_ChatFrame.lua); false, with nothing added, on a client with neither.
---@param events string[]
---@param fn function
---@return boolean added
function ns.AddChatFilters(events, fn)
  local util = type(ChatFrameUtil) == "table" and ChatFrameUtil.AddMessageEventFilter
  local add = type(ChatFrame_AddMessageEventFilter) == "function" and ChatFrame_AddMessageEventFilter or util
  if type(add) ~= "function" then return false end
  for _, event in ipairs(events) do add(event, fn) end
  return true
end

-- State kept for the game's frames ---------------------------------------------------------
-- A field stored on a frame the game owns plants taint, and taint errors in the
-- game's own code then get blamed on Vanguard. So whatever Vanguard remembers
-- about one of the game's frames (skinned once, hooked once, its extra parts)
-- lives in a side table: ns.FrameState(name) is one table per name (frame ->
-- value), shared by every file that asks for that name, with weak keys so a
-- frame the game drops doesn't stay. Vanguard's own frames may keep fields.

local frameStates = {}

-- The side table for one kind of per-frame state (frame -> value), made on first use.
---@param name string
---@return table<table, any> state  weak-keyed, frame -> value
function ns.FrameState(name)
  local t = frameStates[name]
  if not t then
    t = setmetatable({}, { __mode = "k" })
    frameStates[name] = t
  end
  return t
end

-- Caught errors ------------------------------------------------------------------------------
-- A failure Vanguard catches (a module that fails to load, a handler that
-- throws, an icon the client refuses) must not stop the rest, but it shouldn't
-- vanish either. ns.Report keeps one entry per distinct error text, newest
-- last: { text = "where: message", count = how often, stack = the call stack
-- the first time }; the oldest goes past MAX_ERRORS. The first time an error
-- text is seen it is printed to chat, once per session however many other
-- errors have pushed it out of the list since (/vg errors clear starts over);
-- every time, it goes to the game's own error
-- handler (the Lua error popup, or an error addon) when the client has one.

ns.errors = {}
ns.MAX_ERRORS = 20
local byText = {}  -- error text -> its entry in ns.errors
local printed = {}  -- error text -> true once chat has heard of it; not dropped with the entry
local forwarding = false  -- while the game's handler has an error of ours
local watchers = {}  -- told the count when the kept errors change (Core/ErrorBadge.lua)

-- Runs fn(count) on the frame after the kept errors change: an error kept, the list cleared.
---@param fn fun(count: integer)
function ns.OnErrorsChanged(fn)
  watchers[#watchers + 1] = fn
end

-- Tells every watcher how many errors are kept now.
local function tellWatchers()
  for _, fn in ipairs(watchers) do fn(#ns.errors) end
end

-- The kept errors changed: the watchers hear on the next frame (never from
-- inside the error being handled), once however many come in that frame.
local function errorsChanged()
  if ns.Soon then ns.Soon("errorwatchers", tellWatchers) end
end

-- The call stack as text, from `level` frames up (1 = this function); "" when the client can't say.
local function stack(level)
  return type(debugstack) == "function" and tostring(debugstack(level) or "") or ""
end

-- An error value as text; a value the client hides from addons is named, never read.
local function errorText(err)
  if ns.IsSecret and ns.IsSecret(err) then return "(a hidden error message)" end
  return tostring(err)
end

-- A new entry for an error text, at the end of ns.errors; the oldest is dropped past MAX_ERRORS.
local function keep(text, stackText)
  local e = { text = text, count = 0, stack = stackText }
  byText[text], ns.errors[#ns.errors + 1] = e, e
  if #ns.errors > ns.MAX_ERRORS then byText[table.remove(ns.errors, 1).text] = nil end
  errorsChanged()
  return e
end

-- The game's own error handler (the Lua error popup, or an error addon), or
-- nil when the client has none. Blizzard's CallErrorHandler comes first: it
-- tells the popup where the failing stack starts, which a bare
-- geterrorhandler() call does not. Neither exists in the test stub.
local function gameHandler()
  if type(CallErrorHandler) == "function" then return CallErrorHandler end
  local handler = type(geterrorhandler) == "function" and geterrorhandler()
  return type(handler) == "function" and handler or nil
end

-- Hands an error to the game's handler, if there is one.
function ns.ForwardError(err)
  local handler = gameHandler()
  if handler then return handler(err) end
end

-- Tells the game's handler, under pcall; not while it is already handling one
-- of ours (an error addon that fails inside ours can't loop). The pcall adds
-- frames, so this is for errors with no failing stack to point at (ns.Report).
local function forward(text)
  if forwarding then return end
  forwarding = true
  pcall(ns.ForwardError, text)
  forwarding = false
end

-- Keeps the error with the stack from `level` frames up (see stack), tells
-- chat the first time, counts it; returns the text the game's handler gets.
local function record(where, err, level)
  local text = where .. ": " .. errorText(err)
  local e = byText[text] or keep(text, stack(level))
  if not printed[text] then
    printed[text] = true
    ns.Chat(text .. "  (once per error; /vg errors has the stack)")
  end
  e.count = e.count + 1
  return text
end

-- Reports an error caught at `where` (a short name of the site), with the caller's stack.
---@param where string  the site, as /vg errors shows it
---@param err any
function ns.Report(where, err)
  forward(record(where, err, 4))
end

-- Forgets every caught error (/vg errors clear).
function ns.ClearErrors()
  ns.errors, byText, printed = {}, {}, {}
  errorsChanged()
end

-- The `where` of the ns.Try under way (nil outside one), for its message handler.
local current

-- xpcall's message handler. It runs while the failing stack is still there,
-- so the report (the stack, the game's handler) is made from here; once
-- xpcall has returned the frames are gone. The game's handler is called
-- straight from this function, with no pcall in between, so Blizzard's
-- CallErrorHandler (which reports from "the previous function") starts the
-- popup's stack here, at the failing frames. A handler that fails is not
-- guarded: the record is already kept, and the failure it raises passes
-- through here silently (forwarding stays set until xpcall returns).
local function traced(err)
  if forwarding then return err end
  local text = record(current, err, 4)
  local handler = gameHandler()
  forwarding = handler ~= nil
  if handler then handler(text) end
  forwarding = false
  return err
end

-- How long each ns.Try site took (/vg perf slow): where -> { calls, total (ms), longest (ms), slow (calls
-- over ns.SLOW_MS) }, timed with the game's debugprofilestop (ms, fine-grained). At most ns.MAX_TIMINGS sites
-- are kept, so sites named from typed text can't grow it without end. ns.timingCount counts them.
ns.timings, ns.timingCount, ns.SLOW_MS, ns.MAX_TIMINGS = {}, 0, 5, 400

-- Notes one call of `where` that took ms milliseconds.
local function note(where, ms)
  local t = ns.timings[where]
  if not t then
    if ns.timingCount >= ns.MAX_TIMINGS then return end
    t, ns.timingCount = { calls = 0, total = 0, longest = 0, slow = 0 }, ns.timingCount + 1
    ns.timings[where] = t
  end
  t.calls, t.total, t.longest = t.calls + 1, t.total + ms, math.max(t.longest, ms)
  if ms > ns.SLOW_MS then t.slow = t.slow + 1 end
end

-- Puts the outer ns.Try's site back, clears a handler failure and notes the time taken since
-- start (when the client has the clock); passes xpcall's results through.
local function finished(outer, where, start, ...)
  current, forwarding = outer, false
  if start then note(where, debugprofilestop() - start) end
  return ...
end

-- Calls fn(...) with any error reported under `where` (see ns.Report) and
-- returns what pcall would: true and fn's results, or false and the error.
-- The time it took is noted under `where` (ns.timings).
---@param where string
---@param fn function
---@param ... any  arguments for fn
---@return boolean ok, ...  as pcall
function ns.Try(where, fn, ...)
  local outer, clock = current, debugprofilestop
  current = where
  local start = type(clock) == "function" and clock() or nil
  return finished(outer, where, start, xpcall(fn, traced, ...))
end

-- Wraps a hook, OnClick or timer callback so a failure is reported under
-- `where` (ns.errors, /vg errors, the game's handler) instead of escaping.
-- Returns nothing, as the game ignores what these callbacks return; a
-- non-function (nil clears a script) comes back as it is.
---@param where string
---@param fn function|nil
---@return function|nil wrapped  fn under ns.Try; a non-function as it was
function ns.Guard(where, fn)
  if type(fn) ~= "function" then return fn end
  return function(...)
    ns.Try(where, fn, ...)
  end
end

-- The results of a successful ns.Try (its first value), else `fallback`.
local function resultsOr(fallback, ok, ...)
  if ok then return ... end
  return fallback
end

-- Wraps a callback whose results the game reads (a chat filter) so a failure is reported under
-- `where` like ns.Guard, and the game gets `fallback` (false for a chat filter: the line goes through).
-- A non-function comes back as it is.
---@param where string
---@param fn function|nil
---@param fallback any  what the game gets when fn fails
---@return function|nil wrapped  fn's results on success, `fallback` on failure
function ns.GuardResult(where, fn, fallback)
  if type(fn) ~= "function" then return fn end
  return function(...)
    return resultsOr(fallback, ns.Try(where, fn, ...))
  end
end

-- Events ------------------------------------------------------------------------------------

-- Event -> list of handlers. A list is never changed in place: ns.On and
-- ns.Off put a new one in, so a dispatch under way keeps the list it started
-- with (a handler may ns.Off itself) and no event pays for a copy.
local handlers = {}
local frame = CreateFrame("Frame")

-- The list with fn added at the end, or the list itself if fn is already in it.
local function with(list, fn)
  local out = {}
  for i, existing in ipairs(list) do
    if existing == fn then return list end
    out[i] = existing
  end
  out[#out + 1] = fn
  return out
end

-- The list without any copy of fn.
local function without(list, fn)
  local out = {}
  for _, existing in ipairs(list) do
    if existing ~= fn then out[#out + 1] = existing end
  end
  return out
end

local labels = {}

-- "event NAME", the report label for an event, built once per event name.
local function label(event)
  local text = labels[event]
  if not text then
    text = "event " .. event
    labels[event] = text
  end
  return text
end

-- Each handler runs under ns.Try: a failure is reported (/vg errors, the
-- game's handler) and does not stop the others, so one broken module can't
-- take the rest down at PLAYER_LOGIN.
frame:SetScript("OnEvent", function(_, event, ...)
  local list = handlers[event]
  if not list then
    return
  end
  local where = label(event)
  for _, fn in ipairs(list) do
    ns.Try(where, fn, event, ...)
  end
end)

-- Whether this client has the event (registering one it lacks is an error);
-- yes when the client can't say.
local function known(event)
  local check = C_EventUtils and C_EventUtils.IsEventValid
  return type(check) ~= "function" or check(event) ~= false
end

-- Calls fn(event, ...) whenever the event fires. Registering the same
-- function twice is a no-op; an event this client lacks is skipped (and noted).
---@param event string
---@param fn fun(event: string, ...)
function ns.On(event, fn)
  local list = handlers[event]
  if not list then
    if not known(event) then return ns.Report(label(event), "not on this client") end
    frame:RegisterEvent(event)
  end
  handlers[event] = with(list or {}, fn)
end

-- Stops calling fn for the event; unregisters the event when nothing listens.
---@param event string
---@param fn function
function ns.Off(event, fn)
  local list = handlers[event]
  if not list then
    return
  end
  list = without(list, fn)
  handlers[event] = #list > 0 and list or nil
  if #list == 0 then
    frame:UnregisterEvent(event)
  end
end

-- Unit events -------------------------------------------------------------------------------
-- A unit event (UNIT_HEALTH, UNIT_AURA, UNIT_SPELLCAST_START...) fires for
-- every unit the client tracks: party, raid, every nameplate. On the shared
-- frame above each one would reach every handler. ns.OnUnit gives a
-- subscription its own frame, registered with RegisterUnitEvent, so the
-- client only sends the units asked for; a client without that call gets the
-- plain event, and the other units are dropped here.

-- A subscription's OnEvent: its handler under ns.Try, for its own units only.
local function onUnitEvent(sub, event, unit, ...)
  if sub.vgPlain and not sub.vgUnits[unit] then return end
  ns.Try(label(event), sub.vgHandler, event, unit, ...)
end

-- The events this client has, from one name or a list (one it lacks is skipped and noted).
local function knownEvents(events)
  local out = {}
  for _, event in ipairs(type(events) == "table" and events or { events }) do
    if known(event) then out[#out + 1] = event else ns.Report(label(event), "not on this client") end
  end
  return out
end

-- Points a subscription (from ns.OnUnit) at other units, up to three; none stops it.
---@param sub Frame  from ns.OnUnit
---@param unit1 string|nil
---@param unit2 string|nil
---@param unit3 string|nil
function ns.SetUnits(sub, unit1, unit2, unit3)
  sub:UnregisterAllEvents()
  -- A unit as a key; a number stands in for a missing one (no event names a number).
  sub.vgUnits = { [unit1 or 1] = true, [unit2 or 2] = true, [unit3 or 3] = true }
  if unit1 == nil then return end
  for _, event in ipairs(sub.vgEvents) do
    if sub.vgPlain then sub:RegisterEvent(event) else sub:RegisterUnitEvent(event, unit1, unit2, unit3) end
  end
end

-- Calls fn(event, unit, ...) when one of the events (a name or a list) fires
-- for one of the units (up to three; none until ns.SetUnits gives some).
-- Returns the subscription, for ns.SetUnits.
---@param events string|string[]
---@param fn fun(event: string, unit: string, ...)
---@param unit1 string|nil
---@param unit2 string|nil
---@param unit3 string|nil
---@return Frame sub  for ns.SetUnits
function ns.OnUnit(events, fn, unit1, unit2, unit3)
  local sub = CreateFrame("Frame")
  sub.vgEvents, sub.vgHandler = knownEvents(events), fn
  sub.vgPlain = type(sub.RegisterUnitEvent) ~= "function"
  sub:SetScript("OnEvent", onUnitEvent)
  ns.SetUnits(sub, unit1, unit2, unit3)
  return sub
end
