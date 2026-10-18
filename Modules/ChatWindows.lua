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

-- Tabs ------------------------------------------------------------------------------------

-- The message groups a tab can show or hide, as the game names them.
CW.GROUPS = {
  { "SAY", "Say" }, { "YELL", "Yell" }, { "GUILD", "Guild" }, { "PARTY", "Party" }, { "RAID", "Raid" },
  { "WHISPER", "Whispers" }, { "LOOT", "Loot" }, { "SYSTEM", "System messages" },
}
-- The longest tab name.
CW.MAX_NAME = 16

-- The window being edited on the Chat page (a chat window number; the main window when unset or gone).
function CW.Editing()
  for _, w in ipairs(CW.Windows()) do
    if w[1] == CW.editing then return w[1], w[2], w[3] end
  end
  local main = CW.Windows()[1]
  return main and main[1], main and main[2], main and main[3]
end

-- get/set for the tab picker: the choices are the windows showing; a pick rebuilds the page.
function CW.TabSetting()
  return function() return (CW.Editing()) end,
    function(v) CW.editing = v ns.Options.RebuildPage("chat") end
end

-- The windows showing as choices { index, name }.
function CW.TabChoices()
  local out = {}
  for _, w in ipairs(CW.Windows()) do out[#out + 1] = { w[1], w[3] } end
  return out
end

-- get/set for whether the edited tab shows a message group.
function CW.GroupSetting(group)
  return function()
    local _, frame = CW.Editing()
    return frame ~= nil and type(ChatFrame_ContainsMessageGroup) == "function" and ChatFrame_ContainsMessageGroup(frame, group) == true
  end, function(v)
    local _, frame = CW.Editing()
    local call = v and ChatFrame_AddMessageGroup or ChatFrame_RemoveMessageGroup
    if frame and type(call) == "function" then call(frame, group) end
  end
end

-- A tab name as typed: trimmed, with no escape codes, at most CW.MAX_NAME characters (or nil).
function CW.CleanName(text)
  local name = (type(text) == "string" and text or ""):gsub("|", ""):match("^%s*(.-)%s*$"):sub(1, CW.MAX_NAME)
  return name ~= "" and name or nil
end

-- Makes a new chat tab, out of combat, and selects it for editing.
function CW.New(text)
  local name = CW.CleanName(text)
  if not name then return ns.Chat("Type a name for the new tab.") end
  if type(FCF_OpenNewWindow) ~= "function" then return ns.Chat("This client can't make a chat tab.") end
  ns.OutOfCombat(function()
    local frame = FCF_OpenNewWindow(name)
    CW.editing = frame and tonumber((frame:GetName() or ""):match("(%d+)$")) or CW.editing
    ns.Options.RebuildPage("chat")
  end, "chat new tab")
  ns.HideText()
end

-- Renames the edited tab.
function CW.Rename(text)
  local name, _, frame = CW.CleanName(text), CW.Editing()
  if not (name and frame and type(FCF_SetWindowName) == "function") then return ns.Chat("Type a name for the tab.") end
  FCF_SetWindowName(frame, name)
  ns.HideText()
  ns.Options.RebuildPage("chat")
end

-- Closes the edited tab (never the main one), out of combat.
function CW.Close()
  local index, frame = CW.Editing()
  if not frame or index == 1 or type(FCF_Close) ~= "function" then return ns.Chat("The main chat tab can't be closed.") end
  ns.OutOfCombat(function() FCF_Close(frame) CW.editing = nil ns.Options.RebuildPage("chat") end, "chat close tab")
end

-- Module entry point (Core/Modules.lua).
function CW.Enable(settings)
  CW.settings = settings
  if not settings.movers then return end
  for _, window in ipairs(CW.Windows()) do
    if floating(window[1]) then floatingMover(window) end
  end
end
