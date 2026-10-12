-- Chat: every chat window, tab and edit box in the Vanguard look. The
-- windows get a flat panel and the theme font, tabs lose their art and show
-- the accent on the selected one, and the edit box becomes a themed input.
-- Chat text is Small, Medium or Large, scaled by the Text size setting (so
-- one slider shrinks everything), or the size the game's own chat menu set.
-- Messages are never touched: in Midnight some chat text is hidden from
-- addons, so this module only skins.

local ADDON, ns = ...

local T = ns.Theme

local CH = ns.Module("Chat", {
  defaults = { background = true, textSize = 12, place = true, sized = false },
})

-- The main chat window's spot in the Centered layout: bottom-left, under the
-- unit frames and left of the action bars, with room for its tabs above it
-- (it fits at any UI scale). x, y, width, height. It is a mover (/vg unlock);
-- the size is set once, and after that the game's layout and the player rule it.
CH.SPOT = { 16, 20, 420, 140 }

-- Chat text sizes before the Text size setting; "game" keeps each window's own size.
CH.SIZES = { { 10, "Small" }, { 12, "Medium" }, { 14, "Large" }, { "game", "The game's chat setting" } }

-- The chat window count on this client.
local function windowCount()
  return NUM_CHAT_WINDOWS or 10
end

-- A chat window's own font size, or 14.
local function fontSize(frame)
  local _, size = frame:GetFont()
  return ns.PlainNumber(size) or 14
end

-- The size chat text draws at: the chosen size scaled by Text size, or the window's own.
function CH.TextSize(frame)
  local size = CH.settings.textSize
  if type(size) ~= "number" then return fontSize(frame) end
  return T.ScaledSize(size)
end

-- Theme font on a chat window, at the chat text size.
function CH.FontWindow(frame)
  local path, outline = T.Font()
  frame:SetFont(path, CH.TextSize(frame), outline)
end

-- Hides the game's window art. It is hidden, not faded: the game's mouseover
-- fade raises a shown texture's alpha again and skips a hidden one.
local function hideArt(frame)
  local name = frame:GetName()
  for _, part in ipairs(_G.CHAT_FRAME_TEXTURES or {}) do
    local art = _G[name .. part]
    if art then art:Hide() end
  end
end

-- A chat window: theme font, hidden art and (if on) a flat background.
local function skinWindow(frame, settings)
  CH.FontWindow(frame)
  T.FadeRegions(frame)
  hideArt(frame)
  if settings.background then
    CH.backgrounds[frame] = CH.backgrounds[frame] or T.Panel(CreateFrame("Frame", nil, frame), { alpha = 0.55 })
    CH.backgrounds[frame]:SetPoint("TOPLEFT", -4, 4)
    CH.backgrounds[frame]:SetPoint("BOTTOMRIGHT", 4, -4)
    CH.backgrounds[frame]:SetFrameLevel(math.max(0, (frame:GetFrameLevel() or 1) - 1))
  end
end

-- Tab text: accent when selected, gray otherwise.
local function colorTab(tab, selected)
  local text = tab.Text or (tab.GetFontString and tab:GetFontString())
  if text then
    T.Text(text, "label", selected and "accentText" or "text2")
  end
end

-- A tab without its art.
local function skinTab(tab)
  T.FadeRegions(tab, { [tab.Text or false] = true })
  colorTab(tab, false)
end

-- The edit box as a themed input.
local function skinEditBox(box)
  T.EditBox(box)
  T.Text(box, "label")
end

-- Skins chat window i (and its tab and edit box) if this client has it.
local function skinIndex(i, settings)
  local frame = _G["ChatFrame" .. i]
  if not frame then
    return
  end
  skinWindow(frame, settings)
  local tab, box = _G["ChatFrame" .. i .. "Tab"], _G["ChatFrame" .. i .. "EditBox"]
  if tab then skinTab(tab) end
  if box then skinEditBox(box) end
end

-- Re-colors the tabs so the selected window's tab carries the accent.
function CH.UpdateTabs()
  local selected = SELECTED_CHAT_FRAME
  for i = 1, windowCount() do
    local tab = _G["ChatFrame" .. i .. "Tab"]
    if tab then colorTab(tab, _G["ChatFrame" .. i] == selected) end
  end
end

-- Skins every chat window this client has.
function CH.SkinAll()
  for i = 1, windowCount() do
    skinIndex(i, CH.settings)
  end
  CH.UpdateTabs()
end

-- Re-fonts every chat window (after a text size or font change) and re-colors the tabs.
function CH.Refresh()
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then CH.FontWindow(frame) end
  end
  CH.UpdateTabs()
end

-- Keeps the main chat window where its mover put it: the game's Edit Mode
-- re-anchors it whenever a layout is applied.
local function pinChat(frame)
  ns.Pin(frame, function(f)
    local point, relPoint, x, y = ns.MoverPoint("chat")
    f:ClearAllPoints()
    f:SetPoint(point, UIParent, relPoint, x, y)
  end)
end

-- Makes the main chat window a mover (default: its layout spot, bottom-left)
-- when that's switched on, and keeps it there. Done once per login.
function CH.Place()
  local frame = _G.ChatFrame1
  if not CH.settings.place or type(frame) ~= "table" then return end
  ns.Mover(frame, "chat", "Chat", { "BOTTOMLEFT", "BOTTOMLEFT", CH.SPOT[1], CH.SPOT[2] })
  pinChat(frame)
end

-- Sizes the main chat window the first time only (when entering the world, after
-- the game's layout has been applied); a resize after that is the player's.
function CH.Size()
  local frame = _G.ChatFrame1
  if CH.settings.sized or not CH.settings.place or type(frame) ~= "table" then return end
  CH.settings.sized = true
  frame:SetSize(CH.SPOT[3], CH.SPOT[4])
end

-- Hooks a client function by name, when this client has it.
local function after(name, fn)
  if type(hooksecurefunc) == "function" and type(_G[name]) == "function" then hooksecurefunc(name, ns.Guard("hook " .. tostring(name), fn)) end
end

-- The game's own chat size menu re-fonts a window: put ours back (unless chat follows the game).
local function onGameSize()
  if type(CH.settings.textSize) == "number" then CH.Refresh() end
end

-- Module entry point (Core/Modules.lua). Chat frames aren't protected, so
-- this runs at once; temporary windows (whispers) are skinned as they open.
function CH.Enable(settings)
  CH.settings = settings
  CH.backgrounds = {}
  CH.SkinAll()
  T.OnChanged(CH.Refresh)
  CH.Place()
  ns.On("PLAYER_ENTERING_WORLD", CH.Size)
  after("FCF_OpenTemporaryWindow", CH.SkinAll)
  after("FCF_Tab_OnClick", CH.UpdateTabs)
  after("FCF_SetChatWindowFontSize", onGameSize)
end
