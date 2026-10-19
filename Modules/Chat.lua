-- Chat: every chat window, tab and edit box in the Vanguard look. Each
-- window sits in one rounded panel (its fill is the chat background, in
-- Light, Medium or Dark) that holds the text, the scroll bar and a tab bar
-- along its top: the tabs are the theme's tabs (the selected one raised, the
-- others inset, an accent alert glow), 20 tall and centred in the bar, with
-- the Find and Copy buttons at the bar's right end. Tabs stay fully visible
-- (the game fades them until the mouse comes near) while Keep chat tabs
-- visible is on. The main window's side buttons (chat menu, Quick Join,
-- voice, text to speech) lose their round art, sit on the theme's control
-- tiles and stack down from the bar's top, a step apart, hidden ones leaving
-- no gap; each window's minimize box and scroll-to-bottom arrow get tiles
-- too. Chat text is Small, Medium or Large, scaled by the Text size setting
-- (so one slider shrinks everything), or the size the game's own chat menu
-- set. Messages are never touched: in Midnight some chat text is hidden from
-- addons, so this module only skins.

local ADDON, ns = ...

local T = ns.Theme

local CH = ns.Module("Chat", {
  defaults = { background = true, backdrop = 0.75, windowScale = 1, widened = false, textSize = 12, place = true, sized = false, tabsVisible = true },
})

-- The tab bar's height above a chat window: a control-high tab with a tight gap round it.
CH.BAR = T.CONTROL_H + T.SPACE.tight

-- The width (units) of the strip of scroll bar and arrow right of a chat window, which the panel reaches over.
CH.SIDE_COLUMN = 24

-- The room the main window's side buttons take left of its panel (the game keeps them on the
-- left while the window is nearer the screen's left edge): a gap and a tile.
CH.STACK_ROOM = T.SPACE.gap + T.CONTROL.tile

-- The main chat window's spot in the Centered layout: bottom-left, left of the
-- player frame and the action bars, with room for its tab bar above it and
-- its side buttons left of it (it fits at any UI scale). x, y, the widest it
-- starts, height. It is a mover (/vg unlock); the size is set once, and after
-- that the game's layout and the player rule it. Its panel reaches SIDE_COLUMN
-- and a gap past the window's right edge, a gap past its left edge (the stack
-- starts STACK_ROOM left of that, eight units in from the screen's edge, level
-- with the pet bar) and BAR above its top.
CH.SPOT = { 40, 20, 524, 200 }

-- Its size on a screen under SMALL_WIDTH units wide, where it tucks under the player frame (the
-- layout tests keep them apart at 1365 x 768: the panel's top ends a gap short of the frame's
-- bottom line, and its right edge short of the action bars).
CH.SMALL = { 372, 144 }
CH.SMALL_WIDTH = 1600

-- How far left of the screen's centre the player frame's left edge is (Modules/UnitFrames.lua: the
-- frame is 240 wide, centred 240 left), and the gap the chat's panel keeps short of it.
CH.PLAYER_EDGE, CH.CLEARANCE = 360, T.SPACE.gap

-- The widest the main window can start on a screen `width` units wide and still end its panel a
-- clearance short of the player frame: the room left of the frame, less the window's left margin
-- and the panel's reach past its right edge, in whole fours.
local function roomWidth(width)
  local room = width / 2 - CH.PLAYER_EDGE - CH.CLEARANCE - CH.SPOT[1] - CH.SIDE_COLUMN - T.SPACE.tight
  return math.floor(room / 4) * 4
end

-- The first-time size of the main chat window on a screen `width` units wide (UIParent's by
-- default): the full height and as wide as the room left of the player frame allows, up to the
-- widest (524 at 1920 units wide, 416 at 1707, a 1080p screen at setup's 80 % scale), or the small
-- size on a narrow screen.
function CH.DefaultSize(width)
  width = width or ns.PlainNumber(UIParent:GetWidth()) or CH.SMALL_WIDTH
  if width < CH.SMALL_WIDTH then return CH.SMALL[1], CH.SMALL[2] end
  return math.max(CH.SMALL[1], math.min(CH.SPOT[3], roomWidth(width))), CH.SPOT[4]
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

-- Theme font on a chat window, at the chat text size, with the theme's drop shadow under every line
-- (the outline stays the global switch, as on every text role) and a little air between lines.
function CH.FontWindow(frame)
  local path, outline = T.Font()
  frame:SetFont(path, CH.TextSize(frame), outline)
  frame:SetShadowOffset(1, -1)
  frame:SetShadowColor(T.RGB("textShadow"))
  frame:SetSpacing(T.CHAT_TEXT.spacing)
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

-- The chat background strength: the saved one when it is a known level, else the Medium one.
function CH.Strength()
  local saved = CH.settings.backdrop
  for _, level in ipairs(T.CHAT_BACKDROP.levels) do
    if level[1] == saved then return saved end
  end
  return T.CHAT_BACKDROP.levels[2][1]
end

-- Lays a bar's rule along its bottom edge (the window's top), a pixel tall and a pixel in from the
-- panel's border at each end; again after a scale change, when a pixel is another size.
local function placeRule(line, bar)
  local px = T.Pixel(bar)
  line:ClearAllPoints()
  line:SetPoint("BOTTOMLEFT", px, 0)
  line:SetPoint("BOTTOMRIGHT", -px, 0)
  line:SetHeight(px)
end

-- A one-pixel rule along the bar's bottom edge, in the divider colour.
local function barRule(bar)
  local line = bar:CreateTexture(nil, "BORDER")
  line:SetTexture(T.WHITE)
  placeRule(line, bar)
  return T.Tint(line, T.DIVIDER.color)
end

-- The chat window's frame: one rounded panel round the text, the scroll column right of it and the
-- tab bar above it (the panel's fill is the chat background, at the strength setting; a small soft
-- shadow under it while Soft shadows under frames is on, as the HUD's panels have), with the bar
-- as a frame on the panel's top band (the tabs, the dock and the Find and Copy buttons anchor to it).
local function frameParts(frame)
  local gap, level = T.SPACE.tight, math.max(0, (frame:GetFrameLevel() or 1) - 1)
  local outline = CreateFrame("Frame", nil, frame)
  outline:SetPoint("TOPLEFT", -gap, CH.BAR)
  outline:SetPoint("BOTTOMRIGHT", gap + CH.SIDE_COLUMN, -gap)
  outline:SetFrameLevel(level)
  local bar = CreateFrame("Frame", nil, outline)
  bar:SetPoint("TOPLEFT")
  bar:SetPoint("BOTTOMRIGHT", outline, "TOPRIGHT", 0, -CH.BAR)
  T.Panel(outline, { noBg = true, noSheen = true, round = true, shadow = T.Settings().hudShadow == true and T.CHAT_SHADOW or nil })
  return { outline = outline, bar = bar, fill = T.FillParts(outline, "BACKGROUND", -7, "panel", CH.Strength()), rule = barRule(bar) }
end

-- The tab bar above a chat window, made on first use (the window's Find and Copy buttons anchor to it).
function CH.Bar(frame)
  CH.frames = CH.frames or {}
  CH.frames[frame] = CH.frames[frame] or frameParts(frame)
  return CH.frames[frame].bar
end

-- Places a bar button: left of the one before it, else at the bar's right end (the old spot
-- over the window's top right when there is no bar).
local function placeBarButton(button, frame, bar)
  local gap = T.SPACE.tight
  if not bar then return button:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", 0, gap) end
  if CH.lastButton then return button:SetPoint("RIGHT", CH.lastButton, "LEFT", -gap, 0) end
  button:SetPoint("RIGHT", bar, "RIGHT", -gap, 0)
end

-- A small rounded button at the tab bar's right end, left of the ones added before it (Copy, then
-- Find), a control high like the tabs; the tab dock ends before it. With Chat switched off the bar
-- isn't drawn, so it sits over the window's top right instead.
function CH.AddBarButton(frame, label, where, onClick)
  local button = ns.DialogButton(frame, label, 40)
  local bar = ns.ModuleEnabled("Chat") and CH.Bar(frame) or nil
  button:SetHeight(bar and T.CONTROL_H or 16)
  placeBarButton(button, frame, bar)
  if bar then CH.lastButton = button T.SetRound(button, true) CH.PlaceDock() end
  button:SetScript("OnClick", ns.Guard(where, onClick))
  return button
end

-- Shows the panel round a chat window (its bar with it) when the background is on, else hides it.
local function showFrame(frame, on)
  CH.Bar(frame)
  CH.frames[frame].outline:SetShown(on)
end

-- A chat window: theme font, hidden art, and (if on) the rounded panel with the chat background.
local function skinWindow(frame, settings)
  CH.FontWindow(frame)
  T.FadeRegions(frame)
  hideArt(frame)
  showFrame(frame, settings.background)
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

-- A tab a control high, its label centred in it: the game's tab is 32 tall with the label anchored
-- low in its art, which is faded, not resized.
local function sizeTab(tab)
  if type(tab.SetHeight) == "function" then tab:SetHeight(T.CONTROL_H) end
  local text = tab.Text
  if type(text) ~= "table" or type(text.SetPoint) ~= "function" then return end
  text:ClearAllPoints()
  text:SetPoint("CENTER")
end

-- A tab as the theme's tab (raised when selected, inset otherwise, a faint hover, rounded) with its
-- own art gone and its alert glow in the accent colour; the game's flash animation still drives the glow's alpha.
local function skinTab(tab)
  T.Tab(tab)
  T.SetRound(tab, true)
  T.FadeRegions(tab, { [tab.Text or false] = true, [tabGlow(tab) or false] = true })
  local glow = tabGlow(tab)
  if glow then T.Tint(glow, "accent") end
  sizeTab(tab)
  fitTab(tab)
end

-- The edit box as a themed, rounded input.
local function skinEditBox(box)
  T.EditBox(box)
  T.SetRound(box, true)
  T.Text(box, "label")
end

-- The game's six tab alphas: how faint a tab is until the mouse comes near, by its state. Keep chat
-- tabs visible sets them all to 1; the game's own values are kept to give back.
CH.TAB_ALPHAS = { "CHAT_FRAME_TAB_SELECTED_MOUSEOVER_ALPHA", "CHAT_FRAME_TAB_SELECTED_NOMOUSE_ALPHA", "CHAT_FRAME_TAB_ALERTING_MOUSEOVER_ALPHA",
  "CHAT_FRAME_TAB_ALERTING_NOMOUSE_ALPHA", "CHAT_FRAME_TAB_NORMAL_MOUSEOVER_ALPHA", "CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA" }
local gameAlphas

-- The game's own tab alphas, read once before the first change (nil for one this client lacks).
local function rememberAlphas()
  if gameAlphas then return gameAlphas end
  gameAlphas = {}
  for _, name in ipairs(CH.TAB_ALPHAS) do gameAlphas[name] = _G[name] end
  return gameAlphas
end

-- Keeps every chat tab fully visible (Keep chat tabs visible on), or gives the game's fading back
-- (off), and has the game apply the alphas to each window's tab now, where this client can.
function CH.ApplyTabAlpha()
  local game = rememberAlphas()
  for _, name in ipairs(CH.TAB_ALPHAS) do _G[name] = CH.settings.tabsVisible and 1 or game[name] end
  if type(FCFTab_UpdateAlpha) ~= "function" then return end
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then FCFTab_UpdateAlpha(frame) end
  end
end

-- The main window's tab dock (the docked windows' tabs) on its bar, after the game anchors it to the
-- window's art (FCFDock_SetPrimary): its tabs centred in the bar, two units in from the panel's edge,
-- and its right end before the Find and Copy buttons, so spare tabs go to the overflow menu, not under them.
function CH.PlaceDock()
  local dock, frame = _G.GENERAL_CHAT_DOCK, _G.ChatFrame1
  if type(dock) ~= "table" or type(frame) ~= "table" or not (CH.frames and CH.frames[frame]) then return end
  local bar, gap = CH.frames[frame].bar, T.SPACE.tight
  dock:ClearAllPoints()
  dock:SetPoint("BOTTOMLEFT", bar, "BOTTOMLEFT", gap / 2, gap / 2)
  if CH.lastButton then return dock:SetPoint("RIGHT", CH.lastButton, "LEFT", -gap, 0) end
  dock:SetPoint("RIGHT", bar, "RIGHT", -gap, 0)
end

-- A floating window's tab, which the game anchors to the window's art (FCF_SetTabPosition), on
-- the window's bar instead: centred in it, at the x the player dragged it to. A docked window's
-- tab is the dock's (the game places it there in the same breath) and is left alone.
local function placeFloatingTab(frame, x)
  local tab = type(frame) == "table" and not frame.isDocked and _G[(frame:GetName() or "") .. "Tab"] or nil
  if type(tab) ~= "table" or not (CH.frames and CH.frames[frame]) then return end
  local gap = T.SPACE.tight
  tab:ClearAllPoints()
  tab:SetPoint("BOTTOMLEFT", CH.frames[frame].bar, "BOTTOMLEFT", (ns.PlainNumber(x) or 0) + gap / 2, gap / 2)
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

-- The main window's side buttons in stacking order, top to bottom: the chat menu, Quick Join,
-- voice (channel, deafen, mute) and text to speech (the frame the game shows and hides; its
-- button fills it). One the game hides (no voice chat, no text to speech) is skipped, so the ones
-- shown close up.
CH.STACK = { "ChatFrameMenuButton", "QuickJoinToastButton", "ChatFrameChannelButton", "ChatFrameToggleVoiceDeafenButton", "ChatFrameToggleVoiceMuteButton", "TextToSpeechButtonFrame" }

-- Whether a side button is stacked already, so its show and hide are watched once (ns.FrameState).
local vgStacked = ns.FrameState("vgStacked")

-- Puts a side button's tile n steps down the main window's side: a gap and half a tile out from the
-- panel's edge (the left, or the right when the game put the buttons there), the first flush with the bar's top.
local function stackButton(button, bar, right, n)
  local half = T.CONTROL.tile / 2
  button:ClearAllPoints()
  button:SetPoint("CENTER", bar, right and "TOPRIGHT" or "TOPLEFT", (T.SPACE.gap + half) * (right and 1 or -1), -half - n * T.CONTROL.step)
end

-- Watches a side button's show and hide (once), so the stack closes up when one goes or comes back.
local function watchStack(button)
  if vgStacked[button] then return end
  vgStacked[button] = true
  button:HookScript("OnShow", ns.Guard("show chat button", function() CH.StackButtons() end))
  button:HookScript("OnHide", ns.Guard("hide chat button", function() CH.StackButtons() end))
end

-- Stacks the main window's shown side buttons down from its bar's top, a control step apart, on
-- the side the game keeps them (ChatFrame1.buttonSide). Run again whenever one shows or hides,
-- the game re-sides them, or its alert container re-anchors Quick Join and text to speech.
function CH.StackButtons()
  local frame = _G.ChatFrame1
  if type(frame) ~= "table" or not (CH.frames and CH.frames[frame]) then return end
  local bar, right, n = CH.frames[frame].bar, frame.buttonSide == "right", 0
  for _, name in ipairs(CH.STACK) do
    local button = _G[name]
    if isButton(button) then watchStack(button) end
    if isButton(button) and button:IsShown() then stackButton(button, bar, right, n) n = n + 1 end
  end
end

-- The chat frame's shared side buttons on this client: glyph controls and icon buttons, stacked.
function CH.SkinButtons()
  for name, icon in pairs(CH.GLYPH_BUTTONS) do glyphButton(_G[name], icon) end
  for _, name in ipairs(CH.ICON_BUTTONS) do iconButton(_G[name]) end
  CH.StackButtons()
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
  CH.PlaceDock()
end

-- Re-fonts every chat window (after a text size or font change), re-colors the tabs, and sets
-- every panel's fill to the strength setting and its rule to a pixel again (after a scale change).
function CH.Refresh()
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then CH.FontWindow(frame) end
    local parts = frame and CH.frames and CH.frames[frame]
    if parts then T.TintFill(parts.fill, "panel", CH.Strength()) placeRule(parts.rule, parts.bar) end
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

-- The first sizes earlier versions gave the window (0.6's 420 x 140, 0.7.0's 500 x 154 and 420 x 154).
CH.OLD_SIZES = { { 420, 140 }, { 500, 154 }, { 420, 154 } }

-- A profile 0.7.0 saved carries its grown flag (the window had grown to that version's first
-- size); widened takes its place, so a window still at that size is set to the new one once.
ns.Migrate("Chat", function(saved) saved.grown = nil end)

-- Whether the window still has a first size that an earlier version gave it.
local function isOldDefault(frame)
  local w, h = ns.PlainNumber(frame:GetWidth()), ns.PlainNumber(frame:GetHeight())
  for _, size in ipairs(CH.OLD_SIZES) do
    if w == size[1] and h == size[2] then return true end
  end
  return false
end

-- Sizes the main chat window the first time only (when entering the world, after the game's
-- layout has been applied); a resize after that is the player's, except that a window still at
-- an earlier version's first size is set to the new one once.
function CH.Size()
  local frame = _G.ChatFrame1
  if not CH.settings.place or type(frame) ~= "table" then return end
  local first, old = not CH.settings.sized, not CH.settings.widened and isOldDefault(frame)
  CH.settings.sized, CH.settings.widened = true, true
  if first or old then CH.ApplySize() end
end

-- Hooks a client function by name, when this client has it.
local function after(name, fn)
  if type(hooksecurefunc) == "function" and type(_G[name]) == "function" then hooksecurefunc(name, ns.Guard("hook " .. tostring(name), fn)) end
end

-- Re-stacks the side buttons after the game's chat alert container re-anchors Quick Join and text
-- to speech (ChatAlertFrame:UpdateAnchors), when this client has it.
local function watchAlerts()
  local alerts = _G.ChatAlertFrame
  if type(hooksecurefunc) ~= "function" or type(alerts) ~= "table" or type(alerts.UpdateAnchors) ~= "function" then return end
  hooksecurefunc(alerts, "UpdateAnchors", ns.Guard("hook chat alerts", CH.StackButtons))
end

-- The game's own chat size menu re-fonts a window: put ours back (unless chat follows the game).
local function onGameSize()
  if type(CH.settings.textSize) == "number" then CH.Refresh() end
end

-- Follows the game's chat code: new windows are skinned, a tab click repaints the tabs, its size menu
-- re-fonts, and its anchoring of the dock, a floating tab and the side buttons is put right after it.
local function hookGame()
  after("FCF_OpenTemporaryWindow", CH.SkinAll)
  after("FCF_Tab_OnClick", CH.UpdateTabs)
  after("FCF_SetChatWindowFontSize", onGameSize)
  after("FCFDock_SetPrimary", CH.PlaceDock)
  after("FCF_SetTabPosition", placeFloatingTab)
  after("FCF_SetButtonSide", CH.StackButtons)
  watchAlerts()
end

-- Module entry point (Core/Modules.lua). Chat frames aren't protected, so
-- this runs at once; temporary windows (whispers) are skinned as they open.
function CH.Enable(settings)
  CH.settings = settings
  CH.frames, CH.lastButton = {}, nil
  CH.SkinAll()
  CH.ApplyTabAlpha()
  T.OnChanged(CH.Refresh)
  CH.Place()
  ns.On("PLAYER_ENTERING_WORLD", CH.Size)
  hookGame()
end
