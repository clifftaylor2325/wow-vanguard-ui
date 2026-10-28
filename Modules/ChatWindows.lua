-- Chat windows: set each chat window's size and lock from the Chat page
-- (/vg), without the game's Edit Mode. A window's width and height are
-- sliders; Lock chat windows is the game's own lock; Move floating windows
-- makes each window you have pulled out of the dock a /vg unlock handle like
-- the main chat window. The game keeps what you set with its own chat layout
-- save. Messages are never touched.

local ADDON, ns = ...
local L = ns.L

local CW = ns.Module("ChatWindows", { defaults = { movers = false, find = true } })

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

-- Whether window i sits in the dock (the game's docked flag, GetChatWindowInfo's ninth value).
local function docked(i)
  local flag = select(9, GetChatWindowInfo(i))
  return flag ~= nil and flag ~= 0 and flag ~= false
end

-- The chat windows in use for which keep(i, frame) holds, as records { index, frame, name }.
local function windowsWhere(keep)
  local out = {}
  for i = 1, windowCount() do
    local frame, name = _G["ChatFrame" .. i], windowName(i)
    if name and type(frame) == "table" and keep(i, frame) then out[#out + 1] = { index = i, frame = frame, name = name } end
  end
  return out
end

-- The chat windows in use and showing (the size sliders and the floating movers): records { index, frame, name }.
function CW.Shown()
  return windowsWhere(function(_, frame) return frame:IsShown() end)
end

-- The chat windows in use, showing or in the dock behind the selected tab (the game hides every
-- docked window but that one; a closed window is neither): Find, the Tab choice and the lock.
function CW.Windows()
  return windowsWhere(function(i, frame) return frame:IsShown() or docked(i) end)
end

-- The window's width as a plain number.
local function widthOf(frame)
  return ns.PlainNumber(frame:GetWidth()) or 0
end

-- The window's height as a plain number.
local function heightOf(frame)
  return ns.PlainNumber(frame:GetHeight()) or 0
end

-- Saves the window's size and spot in the game's chat layout (where the client can).
local function remember(frame)
  if type(FCF_SavePositionAndDimensions) == "function" then FCF_SavePositionAndDimensions(frame) end
end

-- get/set for one window's width (its height kept as it is).
function CW.WidthSetting(frame)
  return function() return widthOf(frame) end, function(v)
    frame:SetSize(v, heightOf(frame))
    remember(frame)
  end
end

-- get/set for one window's height (its width kept as it is).
function CW.HeightSetting(frame)
  return function() return heightOf(frame) end, function(v)
    frame:SetSize(widthOf(frame), v)
    remember(frame)
  end
end

-- Whether the game has chat window 1 (and so the dock) locked.
local function locked()
  if type(GetChatWindowInfo) ~= "function" then return false end
  local lock = select(8, GetChatWindowInfo(1))
  return lock == true or lock == 1
end

-- get/set for the game's own chat lock (every window in use, docked ones behind another tab too, as
-- the game's own docked lock does).
function CW.LockSetting()
  return locked, function(v)
    if type(FCF_SetLocked) ~= "function" then return end
    for _, w in ipairs(CW.Windows()) do FCF_SetLocked(w.frame, v) end
  end
end

-- Whether window i is pulled out of the dock (the main window never is).
local function floating(i)
  return i > 1 and not docked(i)
end

-- Keeps a floating window where its mover put it (offsets divided by the window's scale, as the mover does).
local function pinTo(frame, key)
  ns.Pin(frame, function(f)
    local point, relPoint, x, y = ns.MoverPoint(key)
    local scale = f:GetScale() or 1
    f:ClearAllPoints()
    f:SetPoint(point, UIParent, relPoint, x / scale, y / scale)
  end)
end

-- Makes a floating window a /vg unlock handle, kept where it is put.
local function floatingMover(window)
  local frame, key = window.frame, "chat" .. window.index
  local point, _, relPoint, x, y = frame:GetPoint(1)
  if not point then return end
  local m = ns.Mover(frame, key, ns.Format(L["Chat: {tab}"], { tab = window.name }), { point, relPoint, x, y })
  m.insets = ns.GetModule("Chat").ClampInsets(frame)
  pinTo(frame, key)
end

-- Tabs ------------------------------------------------------------------------------------

-- The message groups a tab can show or hide, as the game names them.
CW.GROUPS = {
  { "SAY", L["Say"] }, { "YELL", L["Yell"] }, { "GUILD", L["Guild"] }, { "PARTY", L["Party"] }, { "RAID", L["Raid"] },
  { "WHISPER", L["Whispers"] }, { "LOOT", L["Loot"] }, { "SYSTEM", L["System messages"] }, { "OFFICER", L["Officer"] }, { "EMOTE", L["Emotes"] },
}
-- The longest tab name.
CW.MAX_NAME = 16

-- The window being edited on the Chat page (a chat window number; the main window when unset or gone).
function CW.Editing()
  local windows = CW.Windows()
  for _, w in ipairs(windows) do
    if w.index == CW.editing then return w.index, w.frame, w.name end
  end
  local main = windows[1] or {}
  return main.index, main.frame, main.name
end

-- get/set for the tab picker: the choices are the windows in use; a pick rebuilds the page.
function CW.TabSetting()
  return function() return (CW.Editing()) end,
    function(v) CW.editing = v ns.Options.RebuildPage("chat") end
end

-- The windows in use as choices { index, name } (positional: the options cycle reads them by place).
function CW.TabChoices()
  local out = {}
  for _, w in ipairs(CW.Windows()) do out[#out + 1] = { w.index, w.name } end
  return out
end

-- Runs a chat window's message-group call (Contains, Add or Remove) and returns its answer: the window's own
-- method, else the old ChatFrame_<call> global, which the client keeps only with its deprecated chat calls loaded.
local function groupCall(frame, call, group)
  local fn = frame and (frame[call .. "MessageGroup"] or _G["ChatFrame_" .. call .. "MessageGroup"])
  if type(fn) == "function" then return fn(frame, group) end
end

-- get/set for whether the edited tab shows a message group.
function CW.GroupSetting(group)
  return function()
    return groupCall(select(2, CW.Editing()), "Contains", group) == true
  end, function(v)
    groupCall(select(2, CW.Editing()), v and "Add" or "Remove", group)
  end
end

-- A text's first `count` characters, cut on whole UTF-8 characters (string.sub counts bytes, and
-- a cut inside a letter would leave half of it).
local function firstChars(text, count)
  local out = {}
  for ch in text:gmatch("[\1-\127\194-\244][\128-\191]*") do
    if #out == count then break end
    out[#out + 1] = ch
  end
  return table.concat(out)
end

-- A tab name as typed: trimmed, with no escape codes, at most CW.MAX_NAME characters (or nil).
function CW.CleanName(text)
  local name = firstChars((type(text) == "string" and text or ""):gsub("|", ""):match("^%s*(.-)%s*$"), CW.MAX_NAME)
  return name ~= "" and name or nil
end

-- Makes a new chat tab, out of combat (each name asked for in a fight is made after it), and selects it
-- for editing.
function CW.New(text)
  local name = CW.CleanName(text)
  if not name then return ns.Chat(L["Type a name for the new tab."]) end
  if type(FCF_OpenNewWindow) ~= "function" then return ns.Chat(L["This client can't make a chat tab."]) end
  ns.OutOfCombat(function()
    local frame = FCF_OpenNewWindow(name)
    CW.editing = frame and tonumber((frame:GetName() or ""):match("(%d+)$")) or CW.editing
    ns.Options.RebuildPage("chat")
  end, "chat new tab " .. name)
  ns.HideText()
end

-- Renames the edited tab.
function CW.Rename(text)
  local name, _, frame = CW.CleanName(text), CW.Editing()
  if not (name and frame and type(FCF_SetWindowName) == "function") then return ns.Chat(L["Type a name for the tab."]) end
  FCF_SetWindowName(frame, name)
  ns.HideText()
  ns.Options.RebuildPage("chat")
end

-- Whether the game never lets this window be closed (the main tab, the Combat Log, voice transcription): its
-- own tab menu offers no Close for them, and nothing brings one back once closed.
local function isBuiltin(frame)
  return type(IsBuiltinChatWindow) == "function" and IsBuiltinChatWindow(frame) == true
end

-- Closes the edited tab (never the main one or another of the game's own), out of combat (each tab closed in a
-- fight is closed after it).
function CW.Close()
  local index, frame = CW.Editing()
  if not frame or index == 1 or type(FCF_Close) ~= "function" then return ns.Chat(L["The main chat tab can't be closed."]) end
  if isBuiltin(frame) then return ns.Chat(L["The game's own chat tabs can't be closed."]) end
  ns.OutOfCombat(function() FCF_Close(frame) CW.editing = nil ns.Options.RebuildPage("chat") end, "chat close tab " .. index)
end

-- Find ------------------------------------------------------------------------------------

-- At most this many lines are listed (the newest).
CW.MAX_FOUND = 200

-- A line as plain lower-case text for matching (links and colors reduced to their words).
local function plain(text)
  return ns.Lower(ns.GetModule("ChatExtras").Plain(text))
end

-- Every readable line of a window as { text }: lines the game hides are left out.
local function frameLines(frame)
  local out, count = {}, type(frame.GetNumMessages) == "function" and ns.PlainNumber(frame:GetNumMessages()) or 0
  for i = 1, count do
    local text = frame:GetMessageInfo(i)
    if type(text) == "string" and not ns.IsSecret(text) then out[#out + 1] = text end
  end
  return out
end

-- Lines saved for the next login (Modules/ChatHistory.lua) that no window shows any more, oldest first.
local function savedLines(shown)
  local out, CHH = {}, ns.GetModule("ChatHistory")
  local store = CHH.Store()
  for i = 1, windowCount() do
    for _, line in ipairs(type(store[i]) == "table" and store[i] or {}) do
      local text = select(5, CHH.Unpack(line))
      if text and not shown[text] then out[#out + 1] = text end
    end
  end
  return out
end

-- Every line to look through, oldest first: the saved ones no window shows, then each window's own.
local function allLines()
  local shown, all = {}, {}
  for _, w in ipairs(CW.Windows()) do
    for _, text in ipairs(frameLines(w.frame)) do shown[text] = true all[#all + 1] = text end
  end
  local saved = savedLines(shown)
  for _, text in ipairs(all) do saved[#saved + 1] = text end
  return saved
end

-- The lines holding `needle` (lower-case), the newest CW.MAX_FOUND, as plain text.
function CW.Search(needle)
  local found = {}
  for _, text in ipairs(allLines()) do
    if plain(text):find(needle, 1, true) then found[#found + 1] = ns.GetModule("ChatExtras").Plain(text) end
  end
  return { unpack(found, math.max(1, #found - CW.MAX_FOUND + 1)) }
end

-- Finds a word in the chat and the saved history, for the find box: the line that says how many,
-- and the lines with each match in the accent's text colour. An empty word says so in chat and
-- gives nothing (the box keeps its last lines).
function CW.Find(query)
  local needle = ns.Lower((type(query) == "string" and query or ""):match("^%s*(.-)%s*$"))
  if needle == "" then ns.Chat(L["Type something to find."]) return end
  local found = CW.Search(needle)
  local CX = ns.GetModule("ChatExtras")
  local patterns = { CX.Escape(needle) }
  for i, line in ipairs(found) do found[i] = CX.Marked(line, patterns) end
  return ns.Format(L['Chat: {count} lines with "{word}"'], { count = #found, word = needle }), table.concat(found, "\n")
end

-- Opens the find box (Core/Dialog.lua): the word goes in the field at its top, the lines found under it.
function CW.AskFind()
  ns.ShowFind(L["Find in chat"], CW.Find)
end

-- A small Find button in the main chat window's tab bar, left of the Copy button.
local function addFindButton()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" then return nil end
  return ns.GetModule("Chat").AddBarButton(frame, "Find", "click find in chat", CW.AskFind)
end

-- Shows or hides the Find button as its switch is set (made now when it was off at login), at once
-- (Modules/Chat.lua CH.ApplyBarButton).
function CW.ApplyFind()
  CW.findButton = ns.GetModule("Chat").ApplyBarButton(CW.findButton, CW.settings.find == true, addFindButton)
end

-- Module entry point (Core/Modules.lua).
function CW.Enable(settings)
  CW.settings = settings
  CW.ApplyFind()
  if not settings.movers then return end
  for _, window in ipairs(CW.Shown()) do
    if floating(window.index) then floatingMover(window) end
  end
end
