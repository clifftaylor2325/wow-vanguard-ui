-- Chat windows: set each chat window's size and lock from the Chat page
-- (/vg), without the game's Edit Mode. A window's width and height are
-- sliders; Lock chat windows is the game's own lock; Move floating windows
-- makes each window you have pulled out of the dock a /vg unlock handle like
-- the main chat window. The game keeps what you set with its own chat layout
-- save. Messages are never touched.

local ADDON, ns = ...

local CW = ns.Module("ChatWindows", { defaults = { movers = false } })

-- The sliders' ranges (width, height) in units.
CW.WIDTH = { min = 250, max = 900, step = 10, format = function(v) return string.format("%d", math.floor(v + 0.5)) end }
CW.HEIGHT = { min = 80, max = 600, step = 10, format = function(v) return string.format("%d", math.floor(v + 0.5)) end }

-- The chat window count on this client.
local function windowCount()
  return NUM_CHAT_WINDOWS or 10
end

-- The game's name for chat window i, or nil when it is not in use.
local function windowName(i)
  if type(GetChatWindowInfo) ~= "function" then return nil end
  local name = GetChatWindowInfo(i)
  return type(name) == "string" and name ~= "" and name or nil
end

-- The chat windows in use and showing: { index, frame, name } each.
function CW.Windows()
  local out = {}
  for i = 1, windowCount() do
    local frame, name = _G["ChatFrame" .. i], windowName(i)
    if name and type(frame) == "table" and frame:IsShown() then out[#out + 1] = { i, frame, name } end
  end
  return out
end

-- The window's width or height (0 for width, 1 for height) as a plain number.
local function dimension(frame, height)
  return ns.PlainNumber(height and frame:GetHeight() or frame:GetWidth()) or 0
end

-- Saves the window's size and spot in the game's chat layout (where the client can).
local function remember(frame)
  if type(FCF_SavePositionAndDimensions) == "function" then FCF_SavePositionAndDimensions(frame) end
end

-- get/set for one window's width (height = false) or height (height = true).
function CW.SizeSetting(frame, height)
  return function() return dimension(frame, height) end,
    function(v)
      frame:SetSize(height and dimension(frame, false) or v, height and v or dimension(frame, true))
      remember(frame)
    end
end

-- Whether the game has chat window 1 (and so the dock) locked.
local function locked()
  if type(GetChatWindowInfo) ~= "function" then return false end
  local lock = select(8, GetChatWindowInfo(1))
  return lock == true or lock == 1
end

-- get/set for the game's own chat lock (all windows showing).
function CW.LockSetting()
  return locked, function(v)
    if type(FCF_SetLocked) ~= "function" then return end
    for _, w in ipairs(CW.Windows()) do FCF_SetLocked(w[2], v) end
  end
end

-- Whether window i is pulled out of the dock (the main window never is).
local function floating(i)
  local docked = select(9, GetChatWindowInfo(i))
  return i > 1 and (docked == nil or docked == 0 or docked == false)
end

-- Keeps a floating window where its mover put it.
local function pinTo(frame, key)
  ns.Pin(frame, function(f)
    local point, relPoint, x, y = ns.MoverPoint(key)
    f:ClearAllPoints()
    f:SetPoint(point, UIParent, relPoint, x, y)
  end)
end

-- Makes a floating window a /vg unlock handle, kept where it is put.
local function floatingMover(window)
  local frame, key = window[2], "chat" .. window[1]
  local point, _, relPoint, x, y = frame:GetPoint(1)
  if not point then return end
  ns.Mover(frame, key, "Chat: " .. window[3], { point, relPoint, x, y })
  pinTo(frame, key)
end

-- Module entry point (Core/Modules.lua).
function CW.Enable(settings)
  CW.settings = settings
  if not settings.movers then return end
  for _, window in ipairs(CW.Windows()) do
    if floating(window[1]) then floatingMover(window) end
  end
end
