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

-- Chat text sizes before the Text size setting; 0 keeps each window's own size (a number, as the
-- setting's default is: a saved value of another type is put back to the default at login).
CH.SIZES = { { 10, "Small" }, { 12, "Medium" }, { 14, "Large" }, { 0, "The game's chat setting" } }

-- The chat window count on this client.
local function windowCount()
  return NUM_CHAT_WINDOWS or 10
end

-- Every chat window's name: the permanent ones (1 to the window count), then the temporary ones the
-- game lists in CHAT_FRAMES (whispers and pop-outs, ChatFrame11 and up: FCF_OpenTemporaryWindow).
local function windowNames()
  local names, seen = {}, {}
  for i = 1, windowCount() do names[i] = "ChatFrame" .. i seen[names[i]] = true end
  for _, name in ipairs(type(CHAT_FRAMES) == "table" and CHAT_FRAMES or {}) do
    if not seen[name] then names[#names + 1] = name seen[name] = true end
  end
  return names
end

-- A chat window's own font size, or 14.
local function fontSize(frame)
  local _, size = frame:GetFont()
  return ns.PlainNumber(size) or 14
end

-- The chat text size chosen on the Chat page, or nil while chat follows the game's own size (0).
local function chosenSize()
  local size = tonumber(CH.settings.textSize) or 0
  return size > 0 and size or nil
end

-- The size chat text draws at: the chosen size scaled by Text size, or the window's own.
function CH.TextSize(frame)
  local size = chosenSize()
  if size then return T.ScaledSize(size) end
  return fontSize(frame)
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

-- The Chat text fades choices (the Chat page's row, Core/OptionsChat.lua): how long a line stays
-- before it fades (seconds; 0 never fades).
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
  for _, name in ipairs(windowNames()) do
    local frame = _G[name]
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

-- The band the game keeps between a window's tab row and its text: the Combat Log's filter strip
-- (CombatLogQuickButtonFrame, 24 tall, a field Blizzard_CombatLog sets on ChatFrame2 as it loads,
-- pushing the docked log's top down by that much); 0 for a window without one.
local function topInset(frame)
  local strip = frame.CombatLogQuickButtonFrame
  return type(strip) == "table" and ns.PlainNumber(strip:GetHeight()) or 0
end

-- Anchors a frame to the panel's footprint round a chat window: a gap out, the bar's height (and the
-- filter strip's, on the Combat Log) above, the scroll column to the right.
local function pinFootprint(f, frame)
  f:SetPoint("TOPLEFT", frame, "TOPLEFT", -T.SPACE.tight, CH.BAR + topInset(frame))
  f:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", T.SPACE.tight + CH.SIDE_COLUMN, -T.SPACE.tight)
end

-- Seats a window's filter strip in the band under the bar's rule, two units in from the panel's
-- edges as the tab row sits in the bar: the game lifts it 3 units over the window's top, into the
-- rule, and ends it at the scroll bar's edge.
local function seatStrip(frame)
  local strip, margin = frame.CombatLogQuickButtonFrame, T.SPACE.tight / 2
  if type(strip) ~= "table" then return end
  strip:ClearAllPoints()
  strip:SetPoint("BOTTOMLEFT", frame, "TOPLEFT", -margin, 0)
  strip:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", CH.SIDE_COLUMN + margin, 0)
end

-- The scrim behind a window while the chat background is off: a frame under the outline, on the
-- panel's footprint (hidden while the panel shows), holding the three textures; its parts, with the
-- frame as `frame`.
local function scrimFrame(outline, frame)
  local scrim = CreateFrame("Frame", nil, outline)
  pinFootprint(scrim, frame)
  scrim:Hide()
  local s = scrimParts(scrim)
  tintScrim(s)
  s.frame = scrim
  return s
end

-- The painted panel under the outline, on the panel's footprint: the rounded border (a small soft
-- shadow under it while Soft shadows under frames is on, as the HUD's panels have) that the fill
-- goes on; it goes with the Chat background switch, the outline and its bar staying.
local function panelPlate(outline, frame)
  local panel = CreateFrame("Frame", nil, outline)
  pinFootprint(panel, frame)
  T.Panel(panel, { noBg = true, noSheen = true, round = true, shadow = T.Settings().hudShadow == true and T.CHAT_SHADOW or nil })
  return panel
end

-- The bar frame on a panel's top band (the tabs, the dock and the Find and Copy tiles anchor to it).
local function barFrame(outline)
  local bar = CreateFrame("Frame", nil, outline)
  bar:SetPoint("TOPLEFT")
  bar:SetPoint("BOTTOMRIGHT", outline, "TOPRIGHT", 0, -CH.BAR)
  return bar
end

-- The chat window's frame: an outline on the panel's footprint (the text, the scroll column right of
-- it and the tab bar above it, over the Combat Log's filter strip) holding the painted panel (its
-- fill is the chat background, at the strength setting), the bar on its top band and the scrim that
-- stands in for the panel with the background off. It sits in the BACKGROUND strata, under the dock
-- and its tabs: those are low in the LOW strata (the dock is UIParent's child, the window a level-5
-- frame), so a panel a level under the window would still cover them, and the window's text, above
-- the panel in LOW, reads over the fill either way.
local function frameParts(frame)
  local outline = CreateFrame("Frame", nil, frame)
  pinFootprint(outline, frame)
  outline:SetFrameStrata("BACKGROUND")
  seatStrip(frame)
  local panel, bar = panelPlate(outline, frame), barFrame(outline)
  return { outline = outline, panel = panel, bar = bar, fill = T.FillParts(panel, "BACKGROUND", -7, "panel", CH.Strength()), rule = barRule(bar), scrim = scrimFrame(outline, frame) }
end

-- The tab bar above a chat window, made on first use (the window's Find and Copy buttons anchor to it).
function CH.Bar(frame)
  CH.frames = CH.frames or {}
  CH.frames[frame] = CH.frames[frame] or frameParts(frame)
  return CH.frames[frame].bar
end

-- Puts a window's outline, panel and scrim back on the panel's footprint and seats its filter strip
-- again after the game's background layout (FloatingChatFrame_UpdateBackgroundAnchors): the Combat
-- Log runs it on every dock update, and first as its strip loads, which is when its band appears.
-- A window without a strip has nothing to move.
local function placeFootprint(frame)
  local parts = type(frame) == "table" and CH.frames and CH.frames[frame]
  if not parts or topInset(frame) == 0 then return end
  for _, f in ipairs({ parts.outline, parts.panel, parts.scrim.frame }) do pinFootprint(f, frame) end
  seatStrip(frame)
end

-- The bar's buttons by label: the glyph on each one's tile and its slot from the bar's right end
-- (Copy at the end, Find left of it), so their order is fixed here and not by which module asks
-- first. A label not listed takes the slot after them.
CH.BAR_BUTTONS = { Copy = { icon = "Copy", slot = 1 }, Find = { icon = "Search", slot = 2 } }

-- How far a bar button's slot sits in from the bar's right end: a gap, then a tile and a gap per slot before it.
local function slotInset(slot)
  return T.SPACE.tight + (slot - 1) * (T.CONTROL.tile + T.SPACE.tight)
end

-- Places a bar button over the window's top right (no bar: Chat is off), where the buttons sat before the bar.
local function placeLooseButton(button, frame, slot)
  button:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -(slot - 1) * (T.CONTROL.tile + T.SPACE.tight), T.SPACE.tight)
end

-- Each window's bar tiles by slot (window -> { [slot] = button }), kept off the game's frames (ns.FrameState).
local vgBarTiles = ns.FrameState("vgBarTiles")

-- A window's bar tiles' slots, lowest (nearest the bar's right end) first.
local function tileSlots(tiles)
  local slots = {}
  for slot in pairs(tiles) do slots[#slots + 1] = slot end
  table.sort(slots)
  return slots
end

-- Lays a window's shown bar tiles out from the bar's right end in slot order with no gaps (a hidden
-- tile leaves none), remembers the furthest shown one as the bar's end (CH.barEnd and its place,
-- CH.barEndSlot; nil with none shown) and puts the dock's right end before it (CH.PlaceDock).
function CH.PlaceBarButtons(frame)
  local parts, tiles, n = CH.frames and CH.frames[frame], vgBarTiles[frame] or {}, 0
  if not parts then return end
  CH.barEnd, CH.barEndSlot = nil, nil
  for _, slot in ipairs(tileSlots(tiles)) do
    local button = tiles[slot]
    if button:IsShown() then n = n + 1 button:ClearAllPoints() button:SetPoint("RIGHT", parts.bar, "RIGHT", -slotInset(n), 0) CH.barEnd, CH.barEndSlot = button, n end
  end
  CH.PlaceDock()
end

-- Names a glyph tile in a tooltip while the mouse is over it (a tile has no label of its own).
local function tipButton(button, label)
  button:HookScript("OnEnter", ns.Guard("chat tile tip", function(b) GameTooltip:SetOwner(b, "ANCHOR_TOP") GameTooltip:SetText(label) GameTooltip:Show() end))
  button:HookScript("OnLeave", ns.Guard("chat tile tip", function() GameTooltip:Hide() end))
end

-- A glyph tile (the side buttons' window control, 20 x 20) in the tab bar's right end, in the slot
-- CH.BAR_BUTTONS gives its label (Copy at the end, Find left of it; the shown ones close up, and the
-- tab dock ends before the furthest). Its label is its tooltip. With Chat switched off the bar isn't
-- drawn, so it sits over the window's top right instead. Called by Modules/ChatExtras.lua and
-- Modules/ChatWindows.lua, which call CH.PlaceBarButtons after showing or hiding theirs.
function CH.AddBarButton(frame, label, where, onClick)
  local bar = ns.ModuleEnabled("Chat") and CH.Bar(frame) or nil
  local look = CH.BAR_BUTTONS[label] or { icon = "Right", slot = 3 }
  local button = T.WindowControl(CreateFrame("Button", nil, bar or frame), look.icon)
  tipButton(button, label)
  button:SetScript("OnClick", ns.Guard(where, onClick))
  if not bar then placeLooseButton(button, frame, look.slot) return button end
  vgBarTiles[frame] = vgBarTiles[frame] or {}
  vgBarTiles[frame][look.slot] = button
  CH.PlaceBarButtons(frame)
  return button
end

-- Shows the painted panel round a chat window when the background is on, else the scrim in its
-- place (the outline with its bar stays either way).
local function showFrame(frame, on)
  CH.Bar(frame)
  CH.frames[frame].panel:SetShown(on)
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

-- A floating window's tab fitted to its label; a docked window's keeps the width the game gave it
-- (sized for the label in the theme's font when the dock is laid out).
local function fitWindowTab(frame, tab)
  if not frame.isDocked then fitTab(tab) end
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

-- Whether a chat tab has the skin already (ns.FrameState), so the game colouring it again needs
-- only a repaint.
local vgChatTab = ns.FrameState("vgChatTab")

-- Whether each chat tab is the selected one (tab -> boolean), which the theme's tab reads: the game
-- never disables a chat tab, it only tells FCFTab_UpdateColors whether the tab is selected.
local vgChecked = ns.FrameState("vgChecked")

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
  vgChatTab[tab] = true
end

-- A tab after the game colours it (FCFTab_UpdateColors(tab, selected): the dock's layout, a tab
-- click, a new window): its label is gold again, so the theme's tab is painted again, selected as
-- the game says, which puts the label back in the theme's colours; a tab Vanguard hasn't dressed
-- yet gets the skin.
local function restyleTab(tab, selected)
  if type(tab) ~= "table" then return end
  vgChecked[tab] = selected == true
  if vgChatTab[tab] then T.Tab(tab) else skinTab(tab) end
end

-- Notes whether a window's tab is the selected one before it is skinned, as the game colours it: a
-- floating window's always, a docked one's while it is the dock's selected window (where this client
-- can say; the game's next colouring says it anyway).
local function seedSelected(tab, frame)
  local dock = _G.GENERAL_CHAT_DOCK
  if type(FCFDock_GetSelectedWindow) ~= "function" or type(dock) ~= "table" then return end
  vgChecked[tab] = not frame.isDocked or FCFDock_GetSelectedWindow(dock) == frame
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

-- Puts every skinned edit box back under its window's panel (the game anchors it to the window's
-- art again when it lays the dock out) and sizes its rail to its pixels again (after a scale change).
function CH.PlaceEditBoxes()
  for _, name in ipairs(windowNames()) do
    local box, parts = _G[name .. "EditBox"], CH.frames and CH.frames[_G[name] or false]
    if type(box) == "table" and parts and vgRail[box] then placeEditBox(box, parts.outline) placeRail(vgRail[box], box) end
  end
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
  for _, name in ipairs(windowNames()) do
    local frame = _G[name]
    if frame then FCFTab_UpdateAlpha(frame) end
  end
end

-- How often the hidden-until-hover bar looks for the mouse (seconds).
CH.HOVER_POLL = 0.1

-- Whether the mouse rests on a window's edit box, or the typing is in it (HasFocus, where this client has it).
local function inEditBox(frame)
  local box = _G[(frame:GetName() or "") .. "EditBox"]
  if type(box) ~= "table" then return false end
  if box:IsMouseOver() == true then return true end
  return type(box.HasFocus) == "function" and box:HasFocus() == true
end

-- Whether the game is flashing a tab on a window's bar: its own, or for a docked window any docked
-- window's (the game flashes only a window that isn't shown, a docked one behind the shown tab, and
-- every docked tab rides in the dock on the shown window's bar).
local function alerting(frame)
  if CH.alerting[frame] then return true end
  if not frame.isDocked then return false end
  for other in pairs(CH.alerting) do
    if other.isDocked then return true end
  end
  return false
end

-- Whether a window wants its bar: the mouse is over its chat (the text, the bar's band above it and
-- the columns either side) or on its edit box, the typing is in the box, or the game is flashing a
-- tab on it (the bar stays while a tab alerts).
local function wantsBar(frame)
  if alerting(frame) or inEditBox(frame) then return true end
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

-- The dock's scroll child (the tabs past its fixed ones ride in it), or nil on a client without one.
local function dockScrollChild(dock)
  local scroll = dock.scrollFrame
  return type(scroll) == "table" and type(scroll.GetScrollChild) == "function" and scroll:GetScrollChild() or nil
end

-- The main window's tab dock (the docked windows' tabs) on its bar, after the game anchors it to the
-- window's art (FCFDock_SetPrimary): a tab high, two units inside the bar, its right end before the
-- Find and Copy buttons, so spare tabs go to the overflow menu, not under them. The game hangs its
-- fixed tabs from the dock's bottom and the rest a unit under its scroll child's centre
-- (FCFDock_UpdateTabs), so the child is a tab high and rides a unit up: every tab lands centred in
-- the bar, whether the client holds the child by its left edge or by its top.
function CH.PlaceDock()
  local dock, frame = _G.GENERAL_CHAT_DOCK, _G.ChatFrame1
  if type(dock) ~= "table" or type(frame) ~= "table" or not (CH.frames and CH.frames[frame]) then return end
  local bar, gap, child = CH.frames[frame].bar, T.SPACE.tight, dockScrollChild(dock)
  dock:ClearAllPoints()
  dock:SetPoint("TOPLEFT", bar, "TOPLEFT", gap / 2, -gap / 2)
  dock:SetPoint("BOTTOMLEFT", bar, "BOTTOMLEFT", gap / 2, gap / 2)
  dock:SetPoint("RIGHT", CH.barEnd or bar, CH.barEnd and "LEFT" or "RIGHT", -gap, 0)
  if child then child:SetHeight(T.CONTROL_H) child:SetPoint("LEFT", 0, 1) end
end

-- The dock laid out by the game again on the next frame, once for a burst of asks (a chat windows
-- update anchors every window's tab in one go), where this client has the dock's layout function:
-- it puts each docked tab back in the row, sized for its label in the theme's font, and colours
-- it, which restyleTab follows.
local function relayoutDock(dock)
  if type(dock) ~= "table" then dock = _G.GENERAL_CHAT_DOCK end
  if type(dock) ~= "table" or type(FCFDock_UpdateTabs) ~= "function" then return end
  ns.Soon("chat dock", function() FCFDock_UpdateTabs(dock, true) end)
end

-- A window's tab after the game anchors it to the window's art (FCF_SetTabPosition, which a chat
-- windows update does to a docked window too, and the dock, not dirty, would leave it there): a
-- docked window's goes back to the dock; a floating window's sits on its own bar, centred in it,
-- at the x the player dragged it to.
local function placeFloatingTab(frame, x)
  if type(frame) ~= "table" or not (CH.frames and CH.frames[frame]) then return end
  if frame.isDocked then return relayoutDock(frame.dock) end
  local tab = _G[(frame:GetName() or "") .. "Tab"]
  if type(tab) ~= "table" then return end
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

-- A one-pixel accentText ring the size of a control's tile, centred on its button and hidden: the
-- theme's own border (a panel with no fill or sheen, its border set to accentText), the suite's
-- selected-edge mark, for the scroll-to-bottom tile while the game flashes it (new lines below).
local function tileRing(button)
  local ring = CreateFrame("Frame", nil, button)
  ring:SetPoint("CENTER")
  T.PixelSize(ring, T.CONTROL.tile, T.CONTROL.tile, true)
  T.Panel(ring, { noBg = true, noSheen = true })
  T.SetBorder(ring, { T.RGB("accentText") })
  ring:Hide()
  return ring
end

-- Shows the ring while the game's flash on the button plays: hooks on the flash's animation
-- (Flash.FlashAnim, whose IsPlaying the game's own scrollbar fade reads), where this client has it.
local function watchFlash(button, ring)
  local anim = type(button.Flash) == "table" and button.Flash.FlashAnim or nil
  if type(anim) ~= "table" or type(anim.HookScript) ~= "function" then return end
  ring:SetShown(type(anim.IsPlaying) == "function" and anim:IsPlaying() == true)
  anim:HookScript("OnPlay", ns.Guard("chat scroll flash", function() ring:Show() end))
  anim:HookScript("OnStop", ns.Guard("chat scroll flash", function() ring:Hide() end))
  anim:HookScript("OnFinished", ns.Guard("chat scroll flash", function() ring:Hide() end))
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

-- Skins the chat window called name (and its tab, edit box and side buttons) if this client has it.
local function skinNamed(name, settings)
  local frame = _G[name]
  if not frame then
    return
  end
  skinWindow(frame, settings)
  local tab, box = _G[name .. "Tab"], _G[name .. "EditBox"]
  if tab then seedSelected(tab, frame) skinTab(tab) fitWindowTab(frame, tab) end
  if box then skinEditBox(box, CH.frames[frame].outline) end
  skinWindowButtons(frame, name)
  if type(frame.ScrollBar) == "table" then T.ScrollBar(frame.ScrollBar) end
end

-- Re-fits every floating window's tab to its label, and has the dock lay its tabs out again for
-- the font (after a font change).
function CH.RefitTabs()
  for _, name in ipairs(windowNames()) do
    local frame, tab = _G[name], _G[name .. "Tab"]
    if frame and tab then fitWindowTab(frame, tab) end
  end
  relayoutDock()
end

-- Paints the tabs again so the selected window's tab is the raised one (the theme's tab follows the
-- game's own selection; this catches a selection made while the hooks were not watching).
function CH.UpdateTabs()
  for _, name in ipairs(windowNames()) do
    local tab = _G[name .. "Tab"]
    if tab then T.Tab(tab) end
  end
end

-- Skins every chat window this client has, and the chat frame's side buttons, and has the dock lay
-- its tabs out again for the theme's font.
function CH.SkinAll()
  for _, name in ipairs(windowNames()) do
    skinNamed(name, CH.settings)
  end
  CH.SkinButtons()
  CH.UpdateTabs()
  CH.PlaceDock()
  relayoutDock()
end

-- Re-fonts every chat window (after a text size or font change) and sets its line fade again (after
-- Reduce motion), re-colors the tabs, and sets every panel's fill to the strength setting and its
-- scrim to the panel colour, its rule and edit box rail to their pixels again (after a scale change),
-- and its edit box back under the panel.
function CH.Refresh()
  for _, name in ipairs(windowNames()) do
    local frame = _G[name]
    if frame then CH.FontWindow(frame) fadeWindow(frame) end
    local parts = frame and CH.frames and CH.frames[frame]
    if parts then T.TintFill(parts.fill, "panel", CH.Strength()) placeRule(parts.rule, parts.bar) tintScrim(parts.scrim) end
  end
  CH.PlaceEditBoxes()
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
  if chosenSize() then CH.Refresh() end
end

-- Follows the game's tab alert flash (FCF_StartAlertFlash and FCF_StopAlertFlash), which keeps a
-- hidden-until-hover bar while a tab alerts.
local function hookAlertFlash()
  after("FCF_StartAlertFlash", function(frame) setAlerting(frame, true) end)
  after("FCF_StopAlertFlash", function(frame) setAlerting(frame, false) end)
end

-- Follows the game's anchoring of the dock, the edit boxes (its dock layout), a tab, the side
-- buttons and a window's background (the Combat Log's band), and its colouring of a tab: each is
-- put right after it.
local function hookLayout()
  after("FloatingChatFrame_UpdateBackgroundAnchors", placeFootprint)
  after("FCFDock_SetPrimary", CH.PlaceDock)
  after("FCFDock_UpdateTabs", CH.PlaceEditBoxes)
  after("FCFTab_UpdateColors", restyleTab)
  after("FCF_SetTabPosition", placeFloatingTab)
  after("FCF_SetButtonSide", CH.StackButtons)
end

-- Follows the game's chat code: new windows are skinned, a tab click repaints the tabs, its size menu
-- re-fonts, its layout is put right (hookLayout), and its alert flashes are watched for the
-- hidden-until-hover bar.
local function hookGame()
  after("FCF_OpenTemporaryWindow", CH.SkinAll)
  after("FCF_OpenNewWindow", CH.SkinAll)
  after("FCF_Tab_OnClick", CH.UpdateTabs)
  after("FCF_SetChatWindowFontSize", onGameSize)
  hookLayout()
  hookAlertFlash()
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
