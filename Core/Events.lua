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

local handlers = {}
local frame = CreateFrame("Frame")

-- A copy of a handler list, so a handler can ns.Off itself mid-dispatch.
local function snapshot(list)
  local out = {}
  for i, fn in ipairs(list) do
    out[i] = fn
  end
  return out
end

-- True if fn is already in the list.
local function contains(list, fn)
  for _, existing in ipairs(list) do
    if existing == fn then
      return true
    end
  end
  return false
end

frame:SetScript("OnEvent", function(_, event, ...)
  local list = handlers[event]
  if not list then
    return
  end
  for _, fn in ipairs(snapshot(list)) do
    fn(event, ...)
  end
end)

-- Calls fn(event, ...) whenever the event fires. Registering the same
-- function twice is a no-op.
function ns.On(event, fn)
  local list = handlers[event]
  if not list then
    list = {}
    handlers[event] = list
    frame:RegisterEvent(event)
  end
  if not contains(list, fn) then
    list[#list + 1] = fn
  end
end

-- Removes every copy of fn from the list.
local function remove(list, fn)
  for i = #list, 1, -1 do
    if list[i] == fn then
      table.remove(list, i)
    end
  end
end

-- Stops calling fn for the event; unregisters the event when nothing listens.
function ns.Off(event, fn)
  local list = handlers[event]
  if not list then
    return
  end
  remove(list, fn)
  if #list == 0 then
    handlers[event] = nil
    frame:UnregisterEvent(event)
  end
end
