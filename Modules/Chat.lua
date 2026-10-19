-- Chat: every chat window, tab and edit box in the Vanguard look. Each
-- window sits in one rounded panel (its fill is the chat background, in
-- Light, Medium or Dark) that holds the text, the scroll bar and a tab bar
-- along its top: the tabs are the theme's tabs (the selected one raised, the
-- others inset, an accent alert glow), 20 tall and centred in the bar, with
-- the Find and Copy glyph tiles at the bar's right end. Tabs stay fully visible
-- (the game fades them until the mouse comes near) while Keep chat tabs
-- visible is on; with Hide the tab bar until the mouse is over the chat on,
-- the bar and the tabs come only while the mouse is there or a tab alerts.
-- The main window's side buttons (chat menu, Quick Join,
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
  defaults = { background = true, backdrop = 0.75, windowScale = 1, widened = false, textSize = 12, place = true, sized = false, tabsVisible = true, lineFade = 60, barHover = false },
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

-- The Chat text fades choices: how long a line stays before it fades (seconds; 0 never fades).
CH.LINE_FADES = { { 0, "Never" }, { 60, "After 60 seconds" }, { 10, "After 10 seconds" } }

-- How long a line takes to fade once its time is up: the theme's, at most T.COMBAT_FADE in a fight,
-- none under Reduce motion (the line goes at once).
local function lineFadeSeconds()
  if T.Settings().reduceMotion then return 0 end
  return T.FadeTime(T.CHAT_LINE_FADE)
end

-- A window's line fade from the Chat text fades choice: lines stay that long, then fade (Never: no fade).
local function fadeWindow(frame)
  local seconds = tonumber(CH.settings.lineFade) or 0
  frame:SetFading(seconds > 0)
  if seconds > 0 then frame:SetTimeVisible(seconds) end
  frame:SetFadeDuration(lineFadeSeconds())
end

-- Sets every window's line fade again (after the Chat text fades choice, Reduce motion, or a fight's
-- start or end, which caps the fade).
function CH.ApplyFades()
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then fadeWindow(frame) end
  end
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

-- The scrim's three textures on a frame: a left ramp, a solid middle and a long right ramp (T.CHAT_SCRIM).
local function scrimParts(scrim)
  local s = {}
  for _, key in ipairs({ "left", "mid", "right" }) do
    s[key] = scrim:CreateTexture(nil, "BACKGROUND", nil, -7)
    s[key]:SetTexture(T.WHITE)
  end
  s.left:SetPoint("TOPLEFT") s.left:SetPoint("BOTTOMLEFT") s.left:SetWidth(T.CHAT_SCRIM.left)
  s.right:SetPoint("TOPRIGHT") s.right:SetPoint("BOTTOMRIGHT") s.right:SetWidth(T.CHAT_SCRIM.right)
  s.mid:SetPoint("TOPLEFT", s.left, "TOPRIGHT") s.mid:SetPoint("BOTTOMRIGHT", s.right, "BOTTOMLEFT")
  return s
end

-- Colours a scrim in the panel colour at the Light strength: clear to full over the left ramp, full
-- across the middle, full to clear over the right ramp (SetGradient takes the client's colour objects).
local function tintScrim(s)
  local r, g, b = T.RGB("panel")
  local full, clear = CreateColor(r, g, b, T.CHAT_SCRIM.alpha), CreateColor(r, g, b, 0)
  s.left:SetGradient("HORIZONTAL", clear, full)
  s.mid:SetVertexColor(r, g, b, T.CHAT_SCRIM.alpha)
  s.right:SetGradient("HORIZONTAL", full, clear)
end

-- Anchors a frame to the panel's footprint round a chat window: a gap out, the bar's height above,
-- the scroll column to the right.
local function pinFootprint(f, frame)
  f:SetPoint("TOPLEFT", frame, "TOPLEFT", -T.SPACE.tight, CH.BAR)
  f:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", T.SPACE.tight + CH.SIDE_COLUMN, -T.SPACE.tight)
end

-- The scrim behind a window while the chat background is off: a frame on the panel's footprint
-- (hidden while the panel shows) holding the three textures; its parts, with the frame as `frame`.
local function scrimFrame(frame, level)
  local scrim = CreateFrame("Frame", nil, frame)
  pinFootprint(scrim, frame)
  scrim:SetFrameLevel(level)
  scrim:Hide()
  local s = scrimParts(scrim)
  tintScrim(s)
  s.frame = scrim
  return s
end

-- The chat window's frame: one rounded panel round the text, the scroll column right of it and the
-- tab bar above it (the panel's fill is the chat background, at the strength setting; a small soft
-- shadow under it while Soft shadows under frames is on, as the HUD's panels have), with the bar as
-- a frame on the panel's top band (the tabs, the dock and the Find and Copy tiles anchor to it; it
-- stays when the panel goes), and the scrim that stands in for the panel with the background off.
local function frameParts(frame)
  local gap, level = T.SPACE.tight, math.max(0, (frame:GetFrameLevel() or 1) - 1)
  local outline = CreateFrame("Frame", nil, frame)
  pinFootprint(outline, frame)
  outline:SetFrameLevel(level)
  local bar = CreateFrame("Frame", nil, frame)
  bar:SetPoint("TOPLEFT", frame, "TOPLEFT", -gap, CH.BAR)
  bar:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", gap + CH.SIDE_COLUMN, 0)
  T.Panel(outline, { noBg = true, noSheen = true, round = true, shadow = T.Settings().hudShadow == true and T.CHAT_SHADOW or nil })
  return { outline = outline, bar = bar, fill = T.FillParts(outline, "BACKGROUND", -7, "panel", CH.Strength()), rule = barRule(bar), scrim = scrimFrame(frame, level) }
end

-- The tab bar above a chat window, made on first use (the window's Find and Copy buttons anchor to it).
function CH.Bar(frame)
  CH.frames = CH.frames or {}
  CH.frames[frame] = CH.frames[frame] or frameParts(frame)
  return CH.frames[frame].bar
end

-- The bar's buttons by label: the glyph on each one's tile and its slot from the bar's right end
-- (Copy at the end, Find left of it), so their order is fixed here and not by which module asks
-- first. A label not listed takes the slot after them.
CH.BAR_BUTTONS = { Copy = { icon = "Copy", slot = 1 }, Find = { icon = "Search", slot = 2 } }

-- How far a bar button's slot sits in from the bar's right end: a gap, then a tile and a gap per slot before it.
local function slotInset(slot)
  return T.SPACE.tight + (slot - 1) * (T.CONTROL.tile + T.SPACE.tight)
end

-- Places a bar button in its slot at the bar's right end, or (no bar: Chat is off) over the window's
-- top right, where the buttons sat before the bar.
local function placeBarButton(button, frame, bar, slot)
  if bar then return button:SetPoint("RIGHT", bar, "RIGHT", -slotInset(slot), 0) end
  button:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -(slot - 1) * (T.CONTROL.tile + T.SPACE.tight), T.SPACE.tight)
end

-- Names a glyph tile in a tooltip while the mouse is over it (a tile has no label of its own).
local function tipButton(button, label)
  button:HookScript("OnEnter", function(b) GameTooltip:SetOwner(b, "ANCHOR_TOP") GameTooltip:SetText(label) GameTooltip:Show() end)
  button:HookScript("OnLeave", function() GameTooltip:Hide() end)
end

-- Remembers the button furthest from the bar's right end (the tab dock ends before it).
local function barEnd(button, slot)
  if CH.barEndSlot and CH.barEndSlot >= slot then return end
  CH.barEnd, CH.barEndSlot = button, slot
end

-- A glyph tile (the side buttons' window control, 20 x 20) in the tab bar's right end, in the slot
-- CH.BAR_BUTTONS gives its label (Copy at the end, Find left of it); the tab dock ends before the
-- furthest one. Its label is its tooltip. With Chat switched off the bar isn't drawn, so it sits
-- over the window's top right instead. Called by Modules/ChatExtras.lua and Modules/ChatWindows.lua.
function CH.AddBarButton(frame, label, where, onClick)
  local bar = ns.ModuleEnabled("Chat") and CH.Bar(frame) or nil
  local look = CH.BAR_BUTTONS[label] or { icon = "Right", slot = 3 }
  local button = T.WindowControl(CreateFrame("Button", nil, bar or frame), look.icon)
  placeBarButton(button, frame, bar, look.slot)
  tipButton(button, label)
  if bar then barEnd(button, look.slot) CH.PlaceDock() end
  button:SetScript("OnClick", ns.Guard(where, onClick))
  return button
end

-- Shows the panel round a chat window when the background is on, else the scrim in its place (the
-- bar stays either way).
local function showFrame(frame, on)
  CH.Bar(frame)
  CH.frames[frame].outline:SetShown(on)
  CH.frames[frame].scrim.frame:SetShown(not on)
end

-- A chat window: theme font, its line fade, hidden art, and (if on) the rounded panel with the chat background.
local function skinWindow(frame, settings)
  CH.FontWindow(frame)
  fadeWindow(frame)
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

-- A tab as the theme's flat tab (raised with a lit top edge when selected, just its label on the bar
-- otherwise, a faint hover, rounded) with its own art gone and its alert glow in the accent colour;
-- the game's flash animation still drives the glow's alpha.
local function skinTab(tab)
  T.Tab(tab, { flat = true })
  T.SetRound(tab, true)
  T.FadeRegions(tab, { [tab.Text or false] = true, [tabGlow(tab) or false] = true })
  local glow = tabGlow(tab)
  if glow then T.Tint(glow, "accent") end
  sizeTab(tab)
  fitTab(tab)
end

-- Each edit box's rail (box -> texture) and its focus fade (box -> { from, to, start, seconds }),
-- kept off the game's frames (ns.FrameState).
local vgRail, vgBoxFade = ns.FrameState("vgRail"), ns.FrameState("vgBoxFade")

-- How often a focus fade steps (seconds): once a frame at 60 Hz; the time gone is read from the clock.
CH.FADE_STEP = 1 / 60

-- The edit box under the panel: a gap below it, as tall as the tab bar, the panel's full width.
local function placeEditBox(box, outline)
  box:ClearAllPoints()
  box:SetPoint("TOPLEFT", outline, "BOTTOMLEFT", 0, -T.SPACE.tight)
  box:SetPoint("TOPRIGHT", outline, "BOTTOMRIGHT", 0, -T.SPACE.tight)
  box:SetHeight(CH.BAR)
end

-- The channel colour for an edit box's rail: the colour the game gave its header (ChatTypeInfo's for
-- the chat type, which the game looks up in UpdateHeader, numbered channels included), else
-- ChatTypeInfo's for the box's chat type, else the accent.
local function railColor(box)
  local header = _G[(box:GetName() or "") .. "Header"]
  if type(header) == "table" and type(header.GetTextColor) == "function" then return header:GetTextColor() end
  local info = type(ChatTypeInfo) == "table" and ChatTypeInfo[box:GetAttribute("chatType")] or nil
  if type(info) == "table" and ns.PlainNumber(info.r) then return info.r, info.g, info.b end
  return T.Accent()
end

-- Tints an edit box's rail in its channel's colour (after the game's UpdateHeader recolours the header).
local function tintRail(box)
  local rail = vgRail[box]
  if rail then rail:SetVertexColor(railColor(box)) end
end

-- Sizes an edit box's rail to T.SELECT.rail screen pixels down its left edge (again after a scale change).
local function placeRail(rail, box)
  rail:ClearAllPoints()
  rail:SetPoint("TOPLEFT")
  rail:SetPoint("BOTTOMLEFT")
  rail:SetWidth(T.SELECT.rail * T.Pixel(box))
end

-- One step of an edit box's focus fade: its alpha toward the target by the share of the time gone; at
-- the end the job stops.
local function stepBoxFade(box)
  local f = vgBoxFade[box]
  local p = f.seconds > 0 and math.min(1, (GetTime() - f.start) / f.seconds) or 1
  box:SetAlpha(f.from + (f.to - f.from) * p)
  if p >= 1 then ns.Every(box, nil) end
end

-- Fades an edit box's alpha from `from` to `to` over `seconds` (a straight run, at most T.COMBAT_FADE
-- in a fight), stepped by the shared ticker (ns.Every; the client lets no addon animate its frames);
-- at once under Reduce motion.
local function fadeBox(box, from, to, seconds)
  if T.Settings().reduceMotion then return box:SetAlpha(to) end
  vgBoxFade[box] = { from = from, to = to, start = GetTime(), seconds = T.FadeTime(seconds) }
  ns.Every(box, CH.FADE_STEP, stepBoxFade, nil, true)
end

-- Follows the typing into and out of an edit box: it comes to full as it gains the focus and drops
-- back to the game's rest alpha as it loses it (the game sets each at once first; the fade runs from
-- the other end). Its rail follows the game's header colouring.
local function watchEditBox(box)
  box:HookScript("OnEditFocusGained", ns.Guard("chat edit focus", function(b) fadeBox(b, T.CHAT_EDIT.rest, 1, T.CHAT_EDIT.focusIn) end))
  box:HookScript("OnEditFocusLost", ns.Guard("chat edit blur", function(b) fadeBox(b, 1, T.CHAT_EDIT.rest, T.CHAT_EDIT.focusOut) end))
  if type(hooksecurefunc) == "function" and type(box.UpdateHeader) == "function" then hooksecurefunc(box, "UpdateHeader", ns.Guard("hook chat header", tintRail)) end
end

-- An edit box's rail (made once, with the hooks that keep it coloured and fade the box): a texture
-- down the box's left edge over the panel's edge, in the channel colour.
local function editRail(box)
  if vgRail[box] then return vgRail[box] end
  local rail = T.Snap(box:CreateTexture(nil, "ARTWORK"), "fill")
  rail:SetTexture(T.WHITE)
  vgRail[box] = rail
  watchEditBox(box)
  return rail
end

-- The edit box as part of the frame: a themed, rounded input under the panel in the chat text role,
-- with a channel-coloured rail down its left edge; the game's header ("Say:") keeps its colour.
local function skinEditBox(box, outline)
  T.EditBox(box)
  T.SetRound(box, true)
  T.Text(box, "chat")
  placeEditBox(box, outline)
  placeRail(editRail(box), box)
  tintRail(box)
end

-- Sizes a window's edit box rail again (after a scale change), where the box has one.
local function refreshRail(box)
  if type(box) == "table" and vgRail[box] then placeRail(vgRail[box], box) end
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

-- One of the game's tab alphas floored at T.CHAT_TAB_FLOOR (a value this client lacks stays nil).
local function flooredAlpha(value)
  if type(value) ~= "number" then return value end
  return math.max(value, T.CHAT_TAB_FLOOR)
end

-- The game's tab alphas while the bar hides until hover: a tab shows only with the mouse near (the
-- game's own hover fade brings it, at its own pace) or while it alerts (the game's 1 either way).
CH.HOVER_TAB_ALPHAS = { CHAT_FRAME_TAB_SELECTED_MOUSEOVER_ALPHA = 1, CHAT_FRAME_TAB_SELECTED_NOMOUSE_ALPHA = 0, CHAT_FRAME_TAB_ALERTING_MOUSEOVER_ALPHA = 1,
  CHAT_FRAME_TAB_ALERTING_NOMOUSE_ALPHA = 1, CHAT_FRAME_TAB_NORMAL_MOUSEOVER_ALPHA = 1, CHAT_FRAME_TAB_NORMAL_NOMOUSE_ALPHA = 0 }

-- The value for one of the game's tab alphas: the hover ladder while the bar hides until hover, 1
-- while Keep chat tabs visible is on, else the game's own floored at T.CHAT_TAB_FLOOR.
local function tabAlpha(name, game)
  if CH.settings.barHover then return CH.HOVER_TAB_ALPHAS[name] end
  return CH.settings.tabsVisible and 1 or flooredAlpha(game[name])
end

-- Keeps every chat tab fully visible (Keep chat tabs visible on), or gives the game's fading back
-- floored at T.CHAT_TAB_FLOOR (off; the game's FCFTab_UpdateAlpha and its fades read these six
-- values, so the floor holds through both), or the hover ladder (Hide the tab bar until the mouse
-- is over the chat), and has the game apply the alphas to each window's tab now, where this client can.
function CH.ApplyTabAlpha()
  local game = rememberAlphas()
  for _, name in ipairs(CH.TAB_ALPHAS) do _G[name] = tabAlpha(name, game) end
  if type(FCFTab_UpdateAlpha) ~= "function" then return end
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then FCFTab_UpdateAlpha(frame) end
  end
end

-- How often the hidden-until-hover bar looks for the mouse (seconds).
CH.HOVER_POLL = 0.1

-- Whether a window wants its bar: the mouse is over its chat (the text, the bar's band above it and
-- the columns either side), or the game is flashing one of its tabs (the bar stays while a tab alerts).
local function wantsBar(frame)
  if CH.alerting[frame] then return true end
  return frame:IsMouseOver(CH.BAR + T.SPACE.tight, -T.SPACE.tight, -CH.STACK_ROOM, CH.SIDE_COLUMN + T.SPACE.tight) == true
end

-- One look at a window's bar: wanted, it comes in (T.CHAT_BAR_HOVER.showIn) and the idle count
-- starts again; unwanted for hideAfter seconds, it goes (hideOver). Both fades are the theme's, so a
-- fight caps them at T.COMBAT_FADE and Reduce motion makes them instant.
local function pollBar(frame, parts)
  local h = CH.hover[frame] or { idle = 0, shown = true }
  CH.hover[frame] = h
  if wantsBar(frame) then
    h.idle = 0
    if not h.shown then h.shown = true T.FadeIn(parts.bar, T.CHAT_BAR_HOVER.showIn) end
    return
  end
  h.idle = h.idle + CH.HOVER_POLL
  if h.shown and h.idle >= T.CHAT_BAR_HOVER.hideAfter then h.shown = false T.FadeOut(parts.bar, T.CHAT_BAR_HOVER.hideOver) end
end

-- Looks at every window's bar (the shared ticker's job while the switch is on).
local function pollBars()
  for frame, parts in pairs(CH.frames or {}) do pollBar(frame, parts) end
end

-- Remembers which windows' tabs the game is flashing (FCF_StartAlertFlash and FCF_StopAlertFlash).
local function setAlerting(frame, on)
  if type(frame) == "table" then CH.alerting[frame] = on or nil end
end

-- Hide the tab bar until the mouse is over the chat (off by default), at enable and from the Chat
-- page: on, each bar goes after the idle time unless the mouse is there or a tab alerts; off, every
-- bar is back at once. The tabs' alphas follow the switch too (CH.ApplyTabAlpha).
function CH.ApplyBarHover()
  CH.hover, CH.alerting = {}, CH.alerting or {}
  CH.ApplyTabAlpha()
  if CH.settings.barHover then return ns.Every("chat bar hover", CH.HOVER_POLL, pollBars) end
  ns.Every("chat bar hover", nil)
  for _, parts in pairs(CH.frames or {}) do T.StopFade(parts.bar) parts.bar:Show() end
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
  if CH.barEnd then return dock:SetPoint("RIGHT", CH.barEnd, "LEFT", -gap, 0) end
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

-- A one-pixel line in accentText along one side of frame ("TOP", "BOTTOM", "LEFT" or "RIGHT").
local function edgeLine(frame, side)
  local t = T.Tint(T.Snap(frame:CreateTexture(nil, "OVERLAY"), "border"), "accentText")
  local px, upright = T.Pixel(frame), side == "LEFT" or side == "RIGHT"
  t:SetTexture(T.WHITE)
  t:SetPoint(upright and "TOP" .. side or side .. "LEFT")
  t:SetPoint(upright and "BOTTOM" .. side or side .. "RIGHT")
  if upright then t:SetWidth(px) else t:SetHeight(px) end
  return t
end

-- A one-pixel accentText ring the size of a control's tile, centred on its button and hidden: the
-- suite's selected-edge mark, for the scroll-to-bottom tile while the game flashes it (new lines below).
local function tileRing(button)
  local ring = CreateFrame("Frame", nil, button)
  ring:SetPoint("CENTER")
  T.PixelSize(ring, T.CONTROL.tile, T.CONTROL.tile, true)
  for _, side in ipairs({ "TOP", "BOTTOM", "LEFT", "RIGHT" }) do edgeLine(ring, side) end
  ring:Hide()
  return ring
end

-- Shows the ring while the game's flash on the button plays: hooks on the flash's animation
-- (Flash.FlashAnim, whose IsPlaying the game's own scrollbar fade reads), where this client has it.
local function watchFlash(button, ring)
  local anim = type(button.Flash) == "table" and button.Flash.FlashAnim or nil
  if type(anim) ~= "table" or type(anim.HookScript) ~= "function" then return end
  ring:SetShown(type(anim.IsPlaying) == "function" and anim:IsPlaying() == true)
  anim:HookScript("OnPlay", function() ring:Show() end)
  anim:HookScript("OnStop", function() ring:Hide() end)
  anim:HookScript("OnFinished", function() ring:Hide() end)
end

-- Each scroll-to-bottom button's ring (button -> frame), made once (ns.FrameState).
local vgRing = ns.FrameState("vgRing")

-- The scroll-to-bottom arrow as a glyph control with its flash ring (the game shows the button only
-- when scrolled up, and flashes it while new lines arrive below).
local function scrollButton(button)
  if not isButton(button) then return end
  glyphButton(button, "Down")
  if vgRing[button] then return end
  vgRing[button] = tileRing(button)
  watchFlash(button, vgRing[button])
end

-- A window's own side buttons: the minimize box on its button column and the scroll-to-bottom arrow.
local function skinWindowButtons(frame, name)
  local column = frame.buttonFrame or _G[name .. "ButtonFrame"]
  if type(column) == "table" then glyphButton(column.minimizeButton or _G[name .. "ButtonFrameMinimizeButton"], "Minimize") end
  scrollButton(frame.ScrollToBottomButton)
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
  if box then skinEditBox(box, CH.frames[frame].outline) end
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

-- Re-fonts every chat window (after a text size or font change) and sets its line fade again (after
-- Reduce motion), re-colors the tabs, and sets every panel's fill to the strength setting and its
-- scrim to the panel colour, and its rule and edit box rail to their pixels again (after a scale change).
function CH.Refresh()
  for i = 1, windowCount() do
    local frame = _G["ChatFrame" .. i]
    if frame then CH.FontWindow(frame) fadeWindow(frame) end
    local parts = frame and CH.frames and CH.frames[frame]
    if parts then T.TintFill(parts.fill, "panel", CH.Strength()) placeRule(parts.rule, parts.bar) tintScrim(parts.scrim) end
    refreshRail(_G["ChatFrame" .. i .. "EditBox"])
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
  after("FCF_StartAlertFlash", function(frame) setAlerting(frame, true) end)
  after("FCF_StopAlertFlash", function(frame) setAlerting(frame, false) end)
  watchAlerts()
end

-- Module entry point (Core/Modules.lua). Chat frames aren't protected, so
-- this runs at once; temporary windows (whispers) are skinned as they open.
function CH.Enable(settings)
  CH.settings = settings
  CH.frames, CH.barEnd, CH.barEndSlot = {}, nil, nil
  CH.SkinAll()
  CH.ApplyBarHover()
  T.OnChanged(CH.Refresh)
  CH.Place()
  ns.On("PLAYER_ENTERING_WORLD", CH.Size)
  ns.On("PLAYER_REGEN_DISABLED", CH.ApplyFades)
  ns.On("PLAYER_REGEN_ENABLED", CH.ApplyFades)
  hookGame()
end

-- get/set for one of this module's settings (and its default), applied at once through `apply` while the module runs.
local function liveSetting(key, apply)
  return function() return ns.Settings("Chat", CH.defaults)[key] end,
    function(v) ns.Settings("Chat", CH.defaults)[key] = v if CH.settings then apply() end end, CH.defaults[key]
end

-- This module's rows on the Chat page (Core/OptionsChat.lua holds the page; these follow its own rows).
function CH.Rows()
  return {
    { "header", "Chat text and bar" },
    { "cycle", "Chat text fades", CH.LINE_FADES, liveSetting("lineFade", CH.ApplyFades) },
    { "check", "Hide the tab bar until the mouse is over the chat", liveSetting("barHover", CH.ApplyBarHover) },
  }
end
ns.Options.AddRows("chat", CH.Rows)
