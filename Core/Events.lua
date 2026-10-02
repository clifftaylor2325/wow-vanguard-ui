-- One event frame for the whole addon. Modules subscribe with ns.On
-- instead of creating their own frames.

local ADDON, ns = ...

-- "ForeverUI:" in the accent color (plain until the theme has loaded).
local function chatPrefix()
  local T = ns.Theme
  return T and T.Paint("ForeverUI:", "accent") .. " " or "ForeverUI: "
end

-- Prints one line to the default chat frame, prefixed with the addon name.
function ns.Chat(msg)
  if DEFAULT_CHAT_FRAME then
    DEFAULT_CHAT_FRAME:AddMessage(chatPrefix() .. msg)
  end
end

-- Caught errors ------------------------------------------------------------------------------
-- A failure ForeverUI catches (a module that fails to load, a handler that
-- throws, an icon the client refuses) must not stop the rest, but it shouldn't
-- vanish either. ns.Report keeps one entry per distinct error text, newest
-- last: { text = "where: message", count = how often, stack = the call stack
-- the first time }; the oldest goes past MAX_ERRORS. The first time an error
-- is seen it is printed to chat; every time, it goes to the game's own error
-- handler (the Lua error popup, or an error addon) when the client has one.

ns.errors = {}
ns.MAX_ERRORS = 20
local byText = {}  -- error text -> its entry in ns.errors
local forwarding = false  -- while the game's handler has an error of ours

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
  return e
end

-- Hands an error to the game's own handler (the Lua error popup, or an error
-- addon) when the client has one. Blizzard's CallErrorHandler comes first: it
-- tells the popup where the failing stack starts, which a bare
-- geterrorhandler() call does not. Neither exists in the test stub.
function ns.ForwardError(err)
  if type(CallErrorHandler) == "function" then return CallErrorHandler(err) end
  local handler = type(geterrorhandler) == "function" and geterrorhandler()
  if type(handler) == "function" then handler(err) end
end

-- Tells the game's handler, under pcall; not while it is already handling one
-- of ours (an error addon that fails inside ours can't loop).
local function forward(text)
  if forwarding then return end
  forwarding = true
  pcall(ns.ForwardError, text)
  forwarding = false
end

-- Keeps the error with the stack from `level` frames up (see stack), tells
-- chat the first time, and the game's handler every time.
local function report(where, err, level)
  local text = where .. ": " .. errorText(err)
  local e = byText[text]
  if not e then
    e = keep(text, stack(level))
    ns.Chat(text .. "  (once per error; /fui errors has the stack)")
  end
  e.count = e.count + 1
  forward(text)
end

-- Reports an error caught at `where` (a short name of the site), with the caller's stack.
function ns.Report(where, err)
  report(where, err, 4)
end

-- Forgets every caught error (/fui errors clear).
function ns.ClearErrors()
  ns.errors, byText = {}, {}
end

-- The `where` of the ns.Try under way (nil outside one), for its message handler.
local current

-- xpcall's message handler. It runs while the failing stack is still there,
-- so the report (the stack, the game's handler) is made from here; once
-- xpcall has returned the frames are gone. The error itself passes through.
local function traced(err)
  report(current, err, 4)
  return err
end

-- Puts the outer ns.Try's site back; passes xpcall's results through.
local function finished(outer, ...)
  current = outer
  return ...
end

-- Calls fn(...) with any error reported under `where` (see ns.Report) and
-- returns what pcall would: true and fn's results, or false and the error.
function ns.Try(where, fn, ...)
  local outer = current
  current = where
  return finished(outer, xpcall(fn, traced, ...))
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

-- Each handler runs under ns.Try: a failure is reported (/fui errors, the
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
function ns.On(event, fn)
  local list = handlers[event]
  if not list then
    if not known(event) then return ns.Report(label(event), "not on this client") end
    frame:RegisterEvent(event)
  end
  handlers[event] = with(list or {}, fn)
end

-- Stops calling fn for the event; unregisters the event when nothing listens.
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
