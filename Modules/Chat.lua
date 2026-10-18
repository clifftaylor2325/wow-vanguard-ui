-- Chat: every chat window, tab and edit box in the Vanguard look. The
-- windows get a flat panel and the theme font, tabs become the theme's tabs
-- (the selected one raised, the others inset, an accent alert glow), and the
-- edit box becomes a themed input.
-- The background is a soft dark patch behind the text and tab row, fading out at its edges, in Light, Medium or Dark.
-- Chat text is Small, Medium or Large, scaled by the Text size setting (so
-- one slider shrinks everything), or the size the game's own chat menu set.
-- The side buttons (chat menu, voice, text to speech, Quick Join, each
-- window's minimize box and scroll-to-bottom arrow) lose their round art and
-- sit on the theme's control tiles. Messages are never touched: in Midnight
-- some chat text is hidden from addons, so this module only skins.

local ADDON, ns = ...

local T = ns.Theme

local CH = ns.Module("Chat", {
  defaults = { background = true, backdrop = 0.75, windowScale = 1, grown = false, textSize = 12, place = true, sized = false },
})

-- The main chat window's spot in the Centered layout: bottom-left, under the
-- unit frames and left of the action bars, with room for its tabs above it
-- (it fits at any UI scale). x, y, width, height. It is a mover (/vg unlock);
-- the size is set once, and after that the game's layout and the player rule it.
CH.SPOT = { 16, 20, 500, 154 }

-- Its size on a screen under SMALL_WIDTH units wide, where the action bars and unit frames
-- leave less room (the layout tests keep them apart at 1365 x 768).
CH.SMALL = { 420, 154 }
CH.SMALL_WIDTH = 1600

-- The first-time size of the main chat window on a screen `width` units wide (UIParent's by
-- default): the full size, or the small one on a narrow screen.
function CH.DefaultSize(width)
  if (width or ns.PlainNumber(UIParent:GetWidth()) or CH.SMALL_WIDTH) < CH.SMALL_WIDTH then return CH.SMALL[1], CH.SMALL[2] end
  return CH.SPOT[3], CH.SPOT[4]
end

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

-- The tab row's height above a chat window (its tab's, or the game's usual 24).
local function tabRow(frame)
  local tab = _G[(frame:GetName() or "") .. "Tab"]
  return type(tab) == "table" and ns.PlainNumber(tab:GetHeight()) or 24
end

-- The width (units) of the strip of scroll bar and buttons right of a chat window, which the backdrop reaches over.
CH.SIDE_COLUMN = 24

-- The backdrop frame behind a chat window: its text and its tab row, edges fading out.
local function backdropFrame(frame)
  local back = CreateFrame("Frame", nil, frame)
  back:SetPoint("TOPLEFT", -T.SPACE.tight, T.SPACE.tight + tabRow(frame))
  back:SetPoint("BOTTOMRIGHT", T.SPACE.tight + CH.SIDE_COLUMN, -T.SPACE.tight)
  back:SetFrameLevel(math.max(0, (frame:GetFrameLevel() or 1) - 1))
  return { back = back, look = T.Backdrop(back, T.CHAT_BACKDROP.feather) }
end

-- The chat background strength: the saved one when it is a known level, else the Medium one.
function CH.Strength()
  local saved = CH.settings.backdrop
  for _, level in ipairs(T.CHAT_BACKDROP.levels) do
    if level[1] == saved then return saved end
  end
  return T.CHAT_BACKDROP.levels[2][1]
end

-- A chat window: theme font, hidden art and (if on) a soft backdrop behind the text.
local function skinWindow(frame, settings)
  CH.FontWindow(frame)
  T.FadeRegions(frame)
  hideArt(frame)
  if not settings.background then return end
  CH.backgrounds[frame] = CH.backgrounds[frame] or backdropFrame(frame)
  T.SetBackdrop(CH.backgrounds[frame].look, CH.Strength())
end

-- Backdrop strengths for the options cycle.
CH.BACKDROPS = T.CHAT_BACKDROP.levels

-- A tab wide enough for its label at the theme font: the game sized it for its own font, which
-- cut a name to "Gene...".
local function fitTab(tab)
  local text = tab.Text or (tab.GetFontString and tab:GetFontString())
  if not (text and text.GetStringWidth and tab.SetWidth) then return end
  text:SetWidth(0)
  tab:SetWidth(ns.PlainNumber(text:GetStringWidth()) + T.SPACE.col * 2)
end

-- A tab's alert glow (the game flashes it when a line arrives in an unseen window), or nil.
local function tabGlow(tab)
  local name = type(tab.GetName) == "function" and tab:GetName() or nil
  local glow = tab.glow or tab.Glow or (name and _G[name .. "Glow"])
  return type(glow) == "table" and type(glow.SetVertexColor) == "function" and glow or nil
end

-- A tab as the theme's tab (raised when selected, inset otherwise, a faint hover) with its own art
-- gone and its alert glow in the accent colour; the game's flash animation still drives the glow's alpha.
local function skinTab(tab)
  T.Tab(tab)
  T.FadeRegions(tab, { [tab.Text or false] = true, [tabGlow(tab) or false] = true })
  local glow = tabGlow(tab)
  if glow then T.Tint(glow, "accent") end
  fitTab(tab)
end

-- The edit box as a themed input.
local function skinEditBox(box)
  T.EditBox(box)
  T.Text(box, "label")
end

-- The chat frame's shared side buttons drawn as window controls with a theme
-- glyph: the chat menu and Quick Join (when this client has it). Each window's
-- minimize box and scroll-to-bottom arrow are found by name in skinIndex.
CH.GLYPH_BUTTONS = { ChatFrameMenuButton = "NavChat", QuickJoinToastButton = "Social" }

-- The side buttons that keep their own state icon (voice channel, deafen,
-- mute, text to speech), each on the theme's resting tile.
CH.ICON_BUTTONS = { "ChatFrameChannelButton", "ChatFrameToggleVoiceDeafenButton", "ChatFrameToggleVoiceMuteButton", "TextToSpeechButton" }

-- Quick Join's friend and queue counts, drawn over its glyph in the badge role.
CH.BUTTON_COUNTS = { "FriendCount", "QueueCount" }

-- Whether this is a button frame that can carry a tile (a frame with regions of its own).
local function isButton(button)
  return type(button) == "table" and type(button.CreateTexture) == "function" and type(button.GetRegions) == "function"
end

-- A side button that keeps its own state icon: round art faded, the icon on
-- the resting tile. The game's alert flash is faded too; its animation drives
-- the flash's alpha while it plays, so the flash still shows.
local function iconButton(button)
  if not isButton(button) then return end
  T.FadeRegions(button, { [button.Icon or false] = true })
  T.ControlPlate(button)
end

-- Quick Join's counts over its glyph: badge text (the game's colour), drawn above the glyph.
local function raiseCounts(button)
  for _, key in ipairs(CH.BUTTON_COUNTS) do
    local count = button[key]
    if type(count) == "table" and type(count.SetDrawLayer) == "function" then
      T.Text(count, "badge", false)
      count:SetDrawLayer("OVERLAY", 7)
    end
  end
end

-- Quick Join's queue art (QueueButton): the game's toast animation raises it to full alpha and
-- leaves it there while a toast is up, so a fade would not hold; it is hidden instead (the game
-- never shows it itself, only swaps its atlas). The alert flash beside it is faded like the others.
local function hideQueueArt(button)
  local art = button.QueueButton
  if type(art) == "table" and type(art.Hide) == "function" then art:Hide() end
end

-- A side button as a window control: round art faded, a theme glyph on the tile.
local function glyphButton(button, icon)
  if not isButton(button) then return end
  T.WindowControl(button, icon)
  hideQueueArt(button)
  raiseCounts(button)
end

-- A window's own side buttons: the minimize box on its button column and the
-- scroll-to-bottom arrow (the game shows that one only when scrolled up).
local function skinWindowButtons(frame, name)
  local column = frame.buttonFrame or _G[name .. "ButtonFrame"]
  if type(column) == "table" then glyphButton(column.minimizeButton or _G[name .. "ButtonFrameMinimizeButton"], "Minimize") end
  glyphButton(frame.ScrollToBottomButton, "Down")
end

-- The chat frame's shared side buttons on this client: glyph controls and icon buttons.
function CH.SkinButtons()
  for name, icon in pairs(CH.GLYPH_BUTTONS) do glyphButton(_G[name], icon) end
  for _, name in ipairs(CH.ICON_BUTTONS) do iconButton(_G[name]) end
end

-- Skins chat window i (and its tab, edit box and side buttons) if this client has it.
local function skinIndex(i, settings)
  local frame = _G["ChatFrame" .. i]
  if not frame then
    return
  end
  skinWindow(frame, settings)
  local tab, box = _G["ChatFrame" .. i .. "Tab"], _G["ChatFrame" .. i .. "EditBox"]
  if tab then skinTab(tab) end
  if box then skinEditBox(box) end
  skinWindowButtons(frame, "ChatFrame" .. i)
  if type(frame.ScrollBar) == "table" then T.ScrollBar(frame.ScrollBar) end
end

-- Re-fits every tab to its label (after a font change).
function CH.RefitTabs()
  for i = 1, windowCount() do
    local tab = _G["ChatFrame" .. i .. "Tab"]
    if tab then fitTab(tab) end
  end
end

-- Paints the tabs again so the selected window's tab is the raised one (the theme's tab follows the
-- game's own selection; this catches a selection made while the hooks were not watching).
function CH.UpdateTabs()
  for i = 1, windowCount() do
    local tab = _G["ChatFrame" .. i .. "Tab"]
    if tab then T.Tab(tab) end
  end
end

-- Skins every chat window this client has, and the chat frame's side buttons.
function CH.SkinAll()
  for i = 1, windowCount() do
    skinIndex(i, CH.settings)
  end
  CH.SkinButtons()
  CH.UpdateTabs()
end

-- Re-fonts every chat window (after a text size or font change) and re-colors the tabs.
function CH.Refresh()
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then CH.FontWindow(frame) end
    if CH.backgrounds[frame] then T.SetBackdrop(CH.backgrounds[frame].look, CH.Strength()) end
  end
  CH.RefitTabs()
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

-- The Chat window size choices: the default size times 1, 1.5 or 2.
CH.WINDOW_SCALES = { { 1, "Default" }, { 1.5, "Larger" }, { 2, "Largest" } }

-- Sets the main chat window to the default size times the Chat window size choice.
function CH.ApplySize()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" then return end
  local w, h = CH.DefaultSize()
  local scale = tonumber(CH.settings.windowScale) or 1
  frame:SetSize(w * scale, h * scale)
end

-- Whether the window still has the 420 x 140 first size that earlier versions gave it.
local function isOldDefault(frame)
  return ns.PlainNumber(frame:GetWidth()) == 420 and ns.PlainNumber(frame:GetHeight()) == 140
end

-- Sizes the main chat window the first time only (when entering the world, after the game's
-- layout has been applied); a resize after that is the player's, except that a window still at
-- the old 420 x 140 first size grows to the new one once.
function CH.Size()
  local frame = _G.ChatFrame1
  if not CH.settings.place or type(frame) ~= "table" then return end
  local first, old = not CH.settings.sized, not CH.settings.grown and isOldDefault(frame)
  CH.settings.sized, CH.settings.grown = true, true
  if first or old then CH.ApplySize() end
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
