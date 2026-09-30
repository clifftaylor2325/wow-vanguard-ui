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
-- A failure ForeverUI catches (a module that fails to load, an icon the
-- client refuses) must not stop the rest, but it shouldn't vanish either: the
-- last few are kept, newest last, for /fui errors.

ns.errors = {}
ns.MAX_ERRORS = 20

-- Keeps a caught error, saying where it happened; the oldest goes past MAX_ERRORS.
function ns.CaughtError(where, err)
  table.insert(ns.errors, where .. ": " .. tostring(err))
  if #ns.errors > ns.MAX_ERRORS then table.remove(ns.errors, 1) end
end

-- Keeps a failed call's error; passes pcall's results through.
local function checked(where, ok, ...)
  if not ok then ns.CaughtError(where, ...) end
  return ok, ...
end

-- pcall that keeps the error (see ns.CaughtError): returns what pcall returns.
function ns.Try(where, fn, ...)
  return checked(where, pcall(fn, ...))
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

frame:SetScript("OnEvent", function(_, event, ...)
  local list = handlers[event]
  if not list then
    return
  end
  for _, fn in ipairs(list) do
    fn(event, ...)
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
    if not known(event) then return ns.CaughtError("event " .. event, "not on this client") end
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
