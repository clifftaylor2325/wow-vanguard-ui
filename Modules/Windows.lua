-- The game's own windows in the Vanguard look: character, merchant, mail,
-- quest, gossip, trade, loot (its rows too) and roll windows, friends, the dressing room,
-- the flight map, books and letters, the game menu, the ready check, popups,
-- the windows that load later (spellbook, auction house, professions,
-- inspect, guild bank, collections, achievements) and the
-- breath and fatigue bars. Each window keeps its own layout and buttons: its art is faded out
-- (alpha only) and a flat panel, the close button, title font and push
-- buttons are themed. It's done every time a window shows, so parts the game
-- adds later are covered too, and painting again never piles up. The
-- character pane also shows each worn item's durability on its slot.
--
-- Windows are registered by group with GW.Add (docs/design/RESKIN.md 3.1): this
-- file registers the first three groups, and Modules/Windows<Area>.lua add the
-- rest. Each group has its own switch; a window in a group switched off is never hooked.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgCorner = ns.FrameState("vgCorner")
local vgDurability = ns.FrameState("vgDurability")
local vgHooked = ns.FrameState("vgHooked")
local vgDropArrow = ns.FrameState("vgDropArrow")
local vgLootRows = ns.FrameState("vgLootRows")
local vgMenuSkinned = ns.FrameState("vgMenuSkinned")
local vgMoneyBox = ns.FrameState("vgMoneyBox")
local vgPadded = ns.FrameState("vgPadded")
local vgChevron = ns.FrameState("vgChevron")
local vgRowsWatched = ns.FrameState("vgRowsWatched")
local vgRowsLater = ns.FrameState("vgRowsLater")
local vgTimerHook = ns.FrameState("vgTimerHook")
local vgWindow = ns.FrameState("vgWindow")

local T = ns.Theme

local GW = ns.Module("Windows", { defaults = {
  windows = true, popups = true, timers = true, durability = true,
  social = true, town = true, system = true, map = true, menus = true, tabs = true, pvp = true,
  -- Dragging windows by their title bar (Modules/WindowsMove.lua), and the places they were dropped on, by window name.
  movable = true, moved = {},
} })

-- The groups of game windows, each a switch under Game windows.
GW.GROUPS = { "windows", "popups", "timers", "social", "town", "system", "map", "menus", "tabs", "pvp" }
-- Every registered window: name -> { group = , skin = }, and the names in the order registered.
GW.REGISTERED, GW.ORDER = {}, {}

-- Framed windows (most use the game's ButtonFrameTemplate or PortraitFrameTemplate). The loot window
-- is registered on its own below, with its rows (GW.SkinLoot).
GW.FRAMED = {
  "CharacterFrame", "MerchantFrame", "MailFrame", "QuestFrame", "GossipFrame", "TradeFrame",
  "GameMenuFrame", "ReadyCheckFrame", "FriendsFrame", "DressUpFrame", "TaxiFrame", "ItemTextFrame",
  "GroupLootFrame1", "GroupLootFrame2", "GroupLootFrame3", "GroupLootFrame4",
}
GW.POPUPS = { "StaticPopup1", "StaticPopup2", "StaticPopup3", "StaticPopup4" }
-- The breath and fatigue bars' holder (the bars are its unnamed children), skinned by GW.SkinTimerContainer.
GW.TIMERS = { "MirrorTimerContainer" }
-- The windows Vanguard's quest dialog stands in for: the game never shows them while it is on, so they are not skinned.
GW.QUEST_WINDOWS = { QuestFrame = true, GossipFrame = true }
-- Windows that load with their own part of the game: addon name -> window names
-- (filled by GW.Add; the first ones are registered at the end of this file).
GW.ON_DEMAND = {}
-- The windows group's own on-demand windows. (Blizzard_EncounterJournal never loads on Forever.)
GW.LATER = {
  Blizzard_PlayerSpells = { "PlayerSpellsFrame" }, Blizzard_TimeManager = { "TimeManagerFrame" },
  Blizzard_AuctionHouseUI = { "AuctionHouseFrame" }, Blizzard_Professions = { "ProfessionsFrame" },
  Blizzard_InspectUI = { "InspectFrame" }, Blizzard_GuildBankUI = { "GuildBankFrame" },
  Blizzard_Collections = { "CollectionsJournal" }, Blizzard_AchievementUI = { "AchievementFrame" },
  Blizzard_FlightMap = { "FlightMapFrame" },
}
-- The parchment behind book and letter pages (faded: the page text goes light on the dark panel).
GW.ITEM_TEXT_ART = { "ItemTextMaterialTopLeft", "ItemTextMaterialTopRight", "ItemTextMaterialBotLeft", "ItemTextMaterialBotRight", "ItemTextFramePageBg" }
-- A book or letter page's text parts: body text, and its headings.
GW.ITEM_TEXT_TAGS = { P = "text", H1 = "text", H2 = "text", H3 = "text" }
-- Quest window texts the game colors for its parchment (dark brown, unreadable
-- on the dark panel): body text and headings go light.
GW.QUEST_BODY = { "QuestInfoDescriptionText", "QuestInfoObjectivesText", "QuestInfoRewardText", "QuestProgressText", "GreetingText" }
GW.QUEST_HEADS = { "QuestInfoTitleHeader", "QuestInfoDescriptionHeader", "QuestInfoObjectivesHeader", "QuestProgressTitleText", "CurrentQuestsText", "AvailableQuestsText" }
-- Push buttons a window keeps outside its button row (the mail's Open All, Cancel and Send; the trade's Trade and Cancel; the dressing room's Close and Reset).
GW.EXTRA_BUTTONS = {
  MailFrame = { "OpenAllMail", "SendMailCancelButton", "SendMailMailButton" },
  TradeFrame = { "TradeFrameTradeButton", "TradeFrameCancelButton" },
  DressUpFrame = { "DressUpFrameCancelButton", "DressUpFrameResetButton" },
  QuestFrame = {
    "QuestFrameAcceptButton", "QuestFrameDeclineButton", "QuestFrameCompleteQuestButton", "QuestFrameGoodbyeButton",
    "QuestFrameCompleteButton", "QuestFrameGreetingGoodbyeButton",
  },
}
-- The character pane's gear slots (Character<slot>Slot; each button's ID is its inventory slot).
GW.SLOTS = { "Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", "Hands", "Waist", "Legs", "Feet",
  "Finger0", "Finger1", "Trinket0", "Trinket1", "MainHand", "SecondaryHand", "Ranged" }
-- The game menu's header plate: the three textures behind its title.
GW.MENU_PLATE = { "LeftBG", "RightBG", "CenterBG" }
-- A window's art pieces that are faded out, where it has them.
GW.ART = { "NineSlice", "Bg", "TopTileStreaks", "PortraitContainer", "Border", "Inset" }
-- Art that is a window's content, not its frame, by window: faded with the rest, then shown again.
-- The flight map draws its map on a texture of its own (SetTaxiMap: the TaxiMap texture, InsetBg on newer builds).
-- A popup's warning icon and its progress bar's fill are content; so are the guild bank's portrait and the time
-- manager's globe (the clock's ticker is drawn on it).
local POPUP_CONTENT = { "AlertIcon", "ProgressBarFill" }
GW.CONTENT_ART = {
  TaxiFrame = { "TaxiMap", "InsetBg" }, GuildBankFrame = { "Portrait" }, TimeManagerFrame = { "TimeManagerGlobe" },
  StaticPopup1 = POPUP_CONTENT, StaticPopup2 = POPUP_CONTENT, StaticPopup3 = POPUP_CONTENT, StaticPopup4 = POPUP_CONTENT,
}
-- What each window adds inside its frame, by name: function(frame), run by GW.SkinFramed after the window skin
-- (the sections below fill it, each beside the window's other code).
GW.INSIDES = {}
-- How far a window's panel reaches out past the window (units): the game's thick border art sat in
-- that room; it is the contents' margin to the panel's edge on every side (art that fills the window
-- edge to edge, like the spellbook's pages, included), and keeps the close button 12 in from the window.
GW.PAD = 12
-- The windows the game sizes from their own regions and child frames (ResizeLayoutFrame: a popup grows to fit what it
-- shows), by name: the pieces of the panel painted on them, which reach past the window's edge, stay out of that layout.
GW.LAYOUT_WINDOWS = { StaticPopup1 = true, StaticPopup2 = true, StaticPopup3 = true, StaticPopup4 = true }

-- Skinning ------------------------------------------------------------------------------------

-- Fades the art on a window and on each art piece it has (the inset's own frame too).
local function fadeArt(frame)
  T.FadeRegions(frame)
  for _, key in ipairs(GW.ART) do
    local part = frame[key]
    if type(part) == "table" and part.GetRegions then T.FadeRegions(part) end
    if type(part) == "table" and part.SetAlpha and key ~= "Inset" then part:SetAlpha(0) end
  end
  if type(frame.Inset) == "table" and type(frame.Inset.NineSlice) == "table" then frame.Inset.NineSlice:SetAlpha(0) end
end

-- The window's push buttons (its button container's, else Name..Button1-4).
local function buttons(frame, name)
  local container = frame.ButtonContainer
  if type(container) == "table" and type(container.Buttons) == "table" then return container.Buttons end
  local out = {}
  for i = 1, 4 do out[#out + 1] = name and _G[name .. "Button" .. i] or nil end
  return out
end

-- Where a window keeps its maximize and minimize buttons (MaximizeMinimizeButtonFrameTemplate), as parentKeys.
GW.MAX_MIN = { "MaximizeMinimizeFrame", "MaximizeMinimizeButton" }

-- The button at key in a maximize/minimize box as a window control with the icon, when the box has that button.
local function maxMinButton(box, key, icon)
  local button = type(box) == "table" and box[key]
  if type(button) == "table" and button.CreateTexture then T.WindowControl(button, icon) end
end

-- A window's maximize and minimize buttons as window controls with the theme's glyphs (their art faded).
function GW.DressMaxMin(frame)
  for _, key in ipairs(GW.MAX_MIN) do
    maxMinButton(frame[key], "MaximizeButton", "Maximize")
    maxMinButton(frame[key], "MinimizeButton", "Minimize")
  end
end

-- Whether the game set a part by its top-right corner on the window's (a corner close button);
-- read once, before Vanguard moves it, and not decided while it has no anchor yet.
local function atCorner(part, frame)
  if vgCorner[part] ~= nil then return vgCorner[part] end
  local point, rel, relPoint = part:GetPoint(1)
  if point == nil then return false end
  vgCorner[part] = rel == frame and point == "TOPRIGHT" and relPoint == "TOPRIGHT"
  return vgCorner[part]
end

-- Windows whose title row sits higher than the usual one, by global name (or the parent's): how far down (units)
-- the middle of their window controls goes (the map's is 14 down, the others' about 24).
GW.CONTROL_DROP = { WorldMapFrame = 14 }

-- The window's control drop (GW.CONTROL_DROP), looked up by its own name or its parent's (a border frame has
-- none of its own); nil for most.
local function controlDrop(frame)
  local parent = frame:GetParent()
  return GW.CONTROL_DROP[frame:GetName() or ""] or GW.CONTROL_DROP[(parent and parent:GetName()) or ""]
end

-- Puts a window's corner close button where every window has it (T.PlaceClose: T.CONTROL.inset in
-- from the panel's top-right corner) and its maximize/minimize box T.CONTROL.step left of it (the game
-- placed them for its wider art). A close button the game put anywhere else stays there.
function GW.PlaceControls(frame, close)
  if not atCorner(close, frame) then return end
  T.PlaceClose(close, frame, controlDrop(frame))
  for _, key in ipairs(GW.MAX_MIN) do
    local box = frame[key]
    if type(box) == "table" and box.SetPoint then box:ClearAllPoints() box:SetPoint("CENTER", close, "CENTER", -T.CONTROL.step, 0) end
  end
end

-- Puts a wide button of a window's title row (a filter dropdown) level with its close button, its right edge
-- where a maximize box's plate ends (T.CONTROL.step left of the close button's middle), so it keeps clear of the
-- close button's plate.
function GW.BesideClose(part, close)
  if type(part) ~= "table" or type(close) ~= "table" or not part.SetPoint then return end
  part:ClearAllPoints()
  part:SetPoint("RIGHT", close, "CENTER", -T.PixelRound(close, T.CONTROL.step - T.CONTROL.tile / 2), 0)
end

-- The windows whose close button only hides them (the game's UIPanelHideButton: the dialog hides and its queue or
-- check stays): it takes the Minimize glyph on the grey control tile, not the red close cross.
GW.HIDE_BUTTONS = { PVPReadyDialog = true, ReadyStatus = true }

-- Gives a close button its glyph (`paint`) and puts it in its corner (GW.PlaceControls), when it is a button.
local function dressCloseWith(paint, frame, close)
  if type(close) ~= "table" or not close.CreateTexture then return end
  paint(close)
  if close.GetPoint then GW.PlaceControls(frame, close) end
end

-- A window's close button (when it has one) in the theme and in its corner (GW.PlaceControls).
function GW.DressClose(frame, close)
  dressCloseWith(T.CloseButton, frame, close)
end

-- The Minimize glyph, for the close button of a window that only hides (GW.HIDE_BUTTONS).
local function paintMinimize(button)
  T.WindowControl(button, "Minimize")
end

-- The close button of a window that only hides (GW.HIDE_BUTTONS): the Minimize control, in the same corner.
local function dressHideButton(frame, close)
  dressCloseWith(paintMinimize, frame, close)
end

-- A window's or dialog's title text (a font string; skipped when it is not one) in the heading role (the role a game window's own title takes, docs/THEME.md) and the
-- light text colour. The game centres it; only its font and colour change, never its anchors or justification.
function GW.SkinTitle(fs)
  if type(fs) == "table" and fs.SetFont then T.Text(fs, "heading", "text") end
end

-- A window's title in the theme, and in the light text colour again each time the window sets its colour itself
-- (SetTitleColor: the character pane does on every tab and refresh, after it shows).
local function dressTitle(frame)
  local title = (type(frame.TitleContainer) == "table" and frame.TitleContainer.TitleText) or frame.TitleText
  GW.SkinTitle(title)
  if type(title) == "table" and title.SetFont then GW.HookAfter(frame, "SetTitleColor", function() T.Color(title, "text") end) end
end

-- The close, maximize and minimize buttons, title and push buttons in the theme.
local function dressParts(frame, name)
  local close = frame.CloseButton or (name and _G[name .. "CloseButton"])
  if GW.HIDE_BUTTONS[name or ""] then dressHideButton(frame, close) else GW.DressClose(frame, close) end
  GW.DressMaxMin(frame)
  dressTitle(frame)
  for _, b in ipairs(buttons(frame, name)) do T.Button(b) end
  for _, extra in ipairs(GW.EXTRA_BUTTONS[name] or {}) do
    if type(_G[extra]) == "table" then T.Button(_G[extra]) end
  end
end

-- Shows again the art a window keeps as content (GW.CONTENT_ART), found by key on it or by global name.
local function keepContent(frame, name)
  for _, key in ipairs(GW.CONTENT_ART[name or ""] or {}) do
    local art = frame[key] or _G[key]
    if type(art) == "table" and art.SetAlpha then art:SetAlpha(1) end
  end
end

-- A ButtonFrameTemplate window's Inset (the sunk area behind its list or content, its art already faded) painted
-- as an inset panel, once (T.Panel paints a frame only once); a window without one is skipped.
local function paintInset(frame)
  local inset = frame.Inset
  if type(inset) == "table" and inset.CreateTexture then T.Panel(inset, { inset = true, noSheen = true }) end
end

-- The frame's regions and child frames, as a set.
local function members(frame)
  local set = {}
  for _, r in ipairs({ frame:GetRegions() }) do set[r] = true end
  for _, c in ipairs({ frame:GetChildren() }) do set[c] = true end
  return set
end

-- Runs fn(frame, ...) on a layout frame (the game's ResizeLayoutFrame sizes itself from every child region and frame)
-- and marks the pieces fn added to it ignoreInLayout, so Layout() leaves them out.
function GW.InLayout(frame, fn, ...)
  local before = members(frame)
  fn(frame, ...)
  for piece in pairs(members(frame)) do
    if not before[piece] then piece.ignoreInLayout = true end
  end
end

-- A window's flat opaque panel (the world never shows through a window) with a soft shadow `pad` units (default
-- GW.PAD) out past it, kept out of the layout of a window the game sizes from its parts (GW.LAYOUT_WINDOWS).
local function paintPanel(frame, name, pad)
  local opts = { shadow = true, pad = pad or GW.PAD, alpha = 1 }
  if GW.LAYOUT_WINDOWS[name or ""] then GW.InLayout(frame, T.Panel, opts) else T.Panel(frame, opts) end
end

-- Skins one window: art faded (its content art kept), its Inset painted as an inset panel, the window's panel
-- (paintPanel), its parts themed.
function GW.Skin(frame, pad)
  local name = frame.GetName and frame:GetName()
  fadeArt(frame)
  paintInset(frame)
  keepContent(frame, name)
  paintPanel(frame, name, pad)
  dressParts(frame, name)
end

-- Fades each part of a frame named in keys (parentKeys) that it has: a frame's own
-- textures, or a texture itself. Parts it lacks are skipped.
function GW.FadeParts(frame, keys)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part.GetRegions then T.FadeRegions(part)
    elseif type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
  end
end

-- Fades each global texture or frame named in names that this client has (by alpha).
function GW.FadeNamed(names)
  for _, name in ipairs(names) do
    local part = _G[name]
    if type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
  end
end

-- A money line's three denominations (MoneyFrameTemplate and SmallMoneyFrameTemplate, Blizzard_MoneyFrame:
-- a button each, its figure in Text beside its coin).
GW.MONEY_PARTS = { "GoldButton", "SilverButton", "CopperButton" }

-- A money line (the merchant's and its rows' prices; for mail, trade and the bank too) in the theme font:
-- each denomination's figure in the number role, its colour left as the game sets it (red when you can't
-- pay), its coin kept. A frame the client lacks, or one without the parts, is skipped.
function GW.SkinMoney(frame)
  if type(frame) ~= "table" then return end
  for _, key in ipairs(GW.MONEY_PARTS) do
    local fs = type(frame[key]) == "table" and frame[key].Text
    if type(fs) == "table" and fs.SetFont then T.Text(fs, "number", false) end
  end
end

-- A money line that sits in a gold coin box (ContainerMoneyFrameTemplate's Border: the stable's and the bags' foot):
-- the figures in the theme font and the box's art faded for a flat inset behind them; a frame without the box
-- gets the figures only.
function GW.SkinCoinBox(money)
  if type(money) ~= "table" then return end
  GW.SkinMoney(money)
  GW.InsetPanel(money.Border)
end

-- A money display's three denominations (MoneyDisplayFrameTemplate, Blizzard_MoneyFrame: a frame each, its figure in
-- Text beside its icon; no GoldButton keys, so GW.SkinMoney skips it).
GW.MONEY_DISPLAYS = { "GoldDisplay", "SilverDisplay", "CopperDisplay" }

-- One denomination's figure in the number role, its colour left as the game sets it; a part that is not a frame is skipped.
local function skinDenomination(display)
  local fs = type(display) == "table" and display.Text
  if type(fs) == "table" and fs.SetFont then T.Text(fs, "number", false) end
end

-- A money display (the auction house's: the window's money line, the sell form's deposit, the buy dialog's price) in the
-- theme font: each figure in the number role, its icon kept, its colour the game's (grey while disabled). The game puts
-- its own font back whenever it sets one (SetFontObject, SetFontAndIconDisabled), so those are followed. A frame
-- without the parts is skipped.
function GW.SkinMoneyDisplay(frame)
  if type(frame) ~= "table" then return end
  -- Puts the theme font on each figure.
  local function skin() GW.EachKey(frame, GW.MONEY_DISPLAYS, skinDenomination) end
  skin()
  GW.HookAfter(frame, "SetFontObject", skin)
  GW.HookAfter(frame, "SetFontAndIconDisabled", skin)
end

-- A breath or fatigue bar (MirrorTimerTemplate): the window skin hugging the bar (no room around it), its
-- StatusBar in the theme's bar texture and its caption in the small bar text.
function GW.SkinTimer(frame)
  GW.Skin(frame, 0)
  local bar = frame.StatusBar
  if type(bar) == "table" and bar.SetStatusBarTexture then T.StyleBar(bar) end
  if type(frame.Text) == "table" and frame.Text.SetFont then T.Text(frame.Text, "barSmall", "text") end
end

-- The breath and fatigue bars are the container's unnamed children on the 12.x engine
-- (there are no MirrorTimer1-3 globals): skins every timer frame it holds.
local function skinContainerTimers(box)
  for _, child in ipairs({ box:GetChildren() }) do
    if type(child) == "table" and type(child.StatusBar) == "table" then GW.SkinTimer(child) end
  end
end

-- The breath bars' container (MirrorTimerContainer, the timers group): its timers now and each time it
-- shows, and again after the game sets one up (it gives the bar its own texture back then), hooked once.
function GW.SkinTimerContainer(box)
  if type(box.GetChildren) ~= "function" then return end
  skinContainerTimers(box)
  if vgTimerHook[box] or type(box.SetupTimer) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgTimerHook[box] = true
  hooksecurefunc(box, "SetupTimer", ns.Guard("hook SetupTimer", function() skinContainerTimers(box) end))
end

-- Shared skin helpers ----------------------------------------------------------------------------

-- Gives a texture back its alpha (a button's picture or a search box's magnifier, which the theme's button and
-- edit box fade with the rest of the game's art); anything that is not a texture is skipped.
function GW.ShowTexture(texture)
  if type(texture) == "table" and texture.SetAlpha then texture:SetAlpha(1) end
end

-- A button whose picture is its normal and disabled texture (the money arrows, play and reset): a theme button
-- that keeps its picture.
function GW.SkinGlyph(button)
  if type(button) ~= "table" or not button.GetRegions then return end
  T.Button(button)
  GW.ShowTexture(button.GetNormalTexture and button:GetNormalTexture())
  GW.ShowTexture(button.GetDisabledTexture and button:GetDisabledTexture())
end

-- A button's label centred in the button (the game anchors a dropdown's text low); a button without a label is skipped.
function GW.CenterLabel(button)
  local label = type(button) == "table" and button.Text
  if type(label) ~= "table" or not label.SetPoint then return end
  label:ClearAllPoints()
  label:SetPoint("CENTER", button, "CENTER", 0, 0)
end

-- The money well hung under the pane above it: the same left and right edges, T.SPACE.tight clear of it, its bottom
-- where it was (its height less the gap).
local function hangUnder(well, above)
  local height = well:GetHeight()
  well:ClearAllPoints()
  well:SetPoint("TOPLEFT", above, "BOTTOMLEFT", 0, -T.SPACE.tight)
  well:SetPoint("TOPRIGHT", above, "BOTTOMRIGHT", 0, -T.SPACE.tight)
  well:SetHeight(height - T.SPACE.tight)
end

-- The window's money well lined up under the category list above it and its money line centred in it, set in from the
-- right edge by T.SPACE.gap, once (the game anchors the well to the window corner and the line to a plate that sits
-- low in it).
function GW.PadMoneyLine(plate, well, above)
  local line = type(plate) == "table" and plate.MoneyFrame
  if type(line) ~= "table" or not line.SetPoint or type(well) ~= "table" or vgPadded[plate] then return end
  vgPadded[plate] = true
  if type(above) == "table" and above.GetObjectType then hangUnder(well, above) end
  line:ClearAllPoints()
  line:SetPoint("RIGHT", well, "RIGHT", -T.SPACE.gap, 0)
end

-- A theme down arrow (made once) over the game's yellow-square arrow `art` on `button`, which is faded.
function GW.DropArrow(button, art)
  if type(art) ~= "table" or not art.SetAlpha then return end
  art:SetAlpha(0)
  if not vgDropArrow[button] then
    local glyph = T.Snap(button:CreateTexture(nil, "OVERLAY"))
    glyph:SetTexture(T.Icon("Down"))
    T.PixelSize(glyph, T.ARROW.glyph, T.ARROW.glyph, true)
    glyph:SetPoint("CENTER", art, "CENTER")
    vgDropArrow[button] = T.Tint(glyph, T.ARROW.color)
  end
end

-- A dropdown button (the game's DropdownButton) as a theme button with a theme arrow in place of the game's.
function GW.SkinDropdown(dropdown)
  if type(dropdown) ~= "table" or not dropdown.CreateTexture then return end
  T.Button(dropdown)
  GW.DropArrow(dropdown, dropdown.Arrow)
end

-- A dropdown button's gold arrow box faded and a theme chevron (made once) in its place at the right edge.
function GW.Chevron(dropdown)
  if type(dropdown) ~= "table" or not dropdown.CreateTexture then return end
  GW.FadeFrame(dropdown.Arrow)
  if vgChevron[dropdown] then return end
  vgChevron[dropdown] = ns.Widgets.IconTexture(dropdown, "Down", 12, "text2")
  vgChevron[dropdown]:SetPoint("RIGHT", -T.SPACE.gap, 0)
end

-- A dropdown button as a theme button with the game's gold arrow box faded and a theme chevron in its place.
function GW.SkinDropdownChevron(dropdown)
  GW.SkinDropdown(dropdown)
  GW.Chevron(dropdown)
end

-- A button lined up with another on the same row: its height the other's and its right edge T.SPACE.tight left of
-- the other's left edge; anything that is not a pair of frames is skipped.
function GW.AlignBeside(button, other)
  if type(button) ~= "table" or type(other) ~= "table" or not button.SetHeight or not other.GetHeight then return end
  button:SetHeight(other:GetHeight())
  button:ClearAllPoints()
  button:SetPoint("RIGHT", other, "LEFT", -T.SPACE.tight, 0)
end

-- Puts a search box's part (its magnifier or the game's hint text) at x from the box's left edge.
local function placeSearchPart(box, part, x)
  if type(part) ~= "table" or not part.SetPoint then return end
  part:ClearAllPoints()
  part:SetPoint("LEFT", box, "LEFT", x, 0)
end

-- A search box (SearchBoxNineSliceTemplate) as T.EditBox, its magnifier shown again, a gap in from the left edge
-- with the text and the game's hint starting after it.
function GW.SkinSearch(box)
  if type(box) ~= "table" or not box.SetText then return end
  T.EditBox(box)
  GW.ShowTexture(box.searchIcon)
  if box.SetTextInsets then box:SetTextInsets(T.SEARCH_INSET, T.SPACE.gap, 0, 0) end
  placeSearchPart(box, box.searchIcon, T.SPACE.gap)
  placeSearchPart(box, box.Instructions, T.SEARCH_INSET)
end

-- How many frames deep inside a window its check buttons are looked for: the addon list's rows keep theirs
-- four down (ScrollBox, ScrollTarget, the row, Enabled), the chat settings' boxes five.
GW.CHECK_DEPTH = 5

-- Every check button inside frame, up to depth frames down (GW.CHECK_DEPTH unless given), as a themed check
-- box (T.CheckBox); safe to run again, as these windows make their rows and boxes as they draw.
function GW.DressChecks(frame, depth)
  depth = depth or GW.CHECK_DEPTH
  if type(frame) ~= "table" or not frame.GetChildren then return end
  for _, child in ipairs({ frame:GetChildren() }) do
    if child.GetObjectType and child:GetObjectType() == "CheckButton" then T.CheckBox(child)
    elseif depth > 1 then GW.DressChecks(child, depth - 1) end
  end
end

-- The scroll bars a window keeps, by key: the usual one and the description, no-recruits and scrolling-description
-- ones (GW.DressBars in Modules/WindowsTabs.lua looks for each of them on a frame).
GW.SCROLL_KEYS = { "ScrollBar", "DescriptionScrollBar", "NoRecruitsScrollBar", "ScrollingDescriptionScrollBar" }

-- Tries GW.WatchRows again the next time a box with no view yet is shown (once per box).
function GW.WatchRowsLater(box, skin)
  if vgRowsLater[box] or type(box.HookScript) ~= "function" then return end
  vgRowsLater[box] = true
  box:HookScript("OnShow", ns.Guard("watch rows", function() GW.WatchRows(box, skin) end))
end

-- Owner of the callbacks GW.WatchRows leaves on the game's scroll boxes (ScrollUtil wants one).
local rowOwner = {}

-- Runs skin(row) on every row of a ScrollBox now and on each row the game acquires later (a pooled row comes back
-- skinned), once per box. The game's own iterateExisting argument calls back with other arguments than the event
-- does, so it is not used; a failing skin is reported (the box fires it inside its acquire lock) and does not stop the
-- others. A box without ForEachFrame, or already watched, is skipped; one the game has not given a view yet (its
-- ForEachFrame would index nil) is tried again when it is shown.
function GW.WatchRows(box, skin)
  if type(box) ~= "table" or vgRowsWatched[box] or type(box.ForEachFrame) ~= "function" then return end
  if type(box.GetView) == "function" and not box:GetView() then return GW.WatchRowsLater(box, skin) end
  vgRowsWatched[box] = true
  local run = ns.Guard("skin row", skin)
  box:ForEachFrame(function(row) run(row) end)
  local util = _G.ScrollUtil
  if type(util) == "table" and type(util.AddAcquiredFrameCallback) == "function" then
    util.AddAcquiredFrameCallback(box, function(_, row) run(row) end, rowOwner)
  end
end

-- Shared helpers for a window's inside ---------------------------------------------------------

-- Runs fn(part) on each global named in names that this client has (a frame, texture or font string).
local function eachNamed(names, fn)
  for _, name in ipairs(names) do
    local part = _G[name]
    if type(part) == "table" then fn(part) end
  end
end

-- A frame that is only art in the game (an InsetFrameTemplate well, a model scene): its art and nine-slice faded
-- and a flat inset panel in their place (T.Panel paints once); anything that is not a frame is skipped.
function GW.InsetPanel(part)
  if type(part) ~= "table" or not part.GetRegions or not part.CreateTexture then return end
  T.FadeRegions(part)
  if type(part.NineSlice) == "table" and part.NineSlice.SetAlpha then part.NineSlice:SetAlpha(0) end
  T.Panel(part, { inset = true, noSheen = true })
end

-- An item button (a trade row's, a mail attachment's) in the bags' item look: a thin border in the item's
-- quality colour; a button the client lacks is skipped.
function GW.SkinItem(button)
  if type(button) ~= "table" or not button.CreateTexture then return end
  local bags = ns.GetModule("Bags")
  if bags and bags.SkinItem then bags.SkinItem(button) end
end

-- Colours and fonts each font string named in names that this client has: the role's font and a theme colour.
function GW.TextNamed(names, role, token)
  eachNamed(names, function(fs) if fs.SetFont then T.Text(fs, role, token) end end)
end

-- The game's strings for the inbox arrows' captions.
GW.PAGER_CAPTIONS = { "PREV", "NEXT" }

-- Colours and fonts each font string among a frame's regions whose text is one of the game's strings named in
-- names (MAIL_TO_LABEL...): the game's labels carry no name or key to find them by.
function GW.TextRegions(frame, names, role, token)
  if type(frame) ~= "table" or not frame.GetRegions then return end
  local texts = {}
  for _, name in ipairs(names) do
    if type(_G[name]) == "string" then texts[_G[name]] = true end
  end
  for _, region in ipairs({ frame:GetRegions() }) do
    if region.SetFont and region.GetText and texts[region:GetText()] then T.Text(region, role, token) end
  end
end

-- A push button the window skin does not reach (a button under a key, not Button1-4) as a theme button; anything
-- that is not a frame is skipped.
function GW.SkinButton(button)
  if type(button) == "table" and button.CreateTexture then T.Button(button) end
end

-- A frame's own art faded (a parchment panel, left on the window's inset); anything that is not a frame is skipped.
function GW.FadeArt(part)
  if type(part) == "table" and part.GetRegions then T.FadeRegions(part) end
end

-- A button of a window's control row that keeps its own icon (a roll button's dice, the dressing room's outfit
-- toggle) on the control tile; anything that is not a frame is skipped.
function GW.SkinPlate(button)
  if type(button) == "table" and button.CreateTexture then T.ControlPlate(button) end
end

-- A progress bar (a countdown, a reading bar) as a flat inset track with the theme's bar texture: the game's
-- frame and background faded, and the fill (which the fade reaches too) shown again; anything else is skipped.
function GW.SkinProgress(bar)
  if type(bar) ~= "table" or not bar.SetStatusBarTexture then return end
  T.FadeRegions(bar)
  T.StyleBar(bar)
  T.Panel(bar, { inset = true, noSheen = true })
  GW.ShowTexture(bar:GetStatusBarTexture())
end

-- A radio button (UIRadioButtonTemplate) as a theme radio; anything that is not a frame is skipped.
function GW.SkinRadio(button)
  if type(button) == "table" and button.CreateTexture then T.Radio(button) end
end

-- A check button (the game's check box art, its label kept) as a theme check box; anything that is not one is skipped.
function GW.SkinCheck(button)
  if type(button) == "table" and button.CreateTexture and button.GetChecked then T.CheckBox(button) end
end

-- A list row in the theme (T.Row: the hover wash, the press shade and the selected look) with the game's art on it faded, except
-- the parts under keys (an icon, a banner) and the row's own layers; anything that is not a frame is skipped. Safe to run again.
function GW.DressRow(row, keys)
  if type(row) ~= "table" or not row.CreateTexture then return end
  T.Row(row)
  local keep = GW.KeepKeys(row, keys or {})
  for _, part in pairs(T.RowParts(row) or {}) do
    if type(part) == "table" then keep[part] = true end
  end
  T.FadeRegions(row, keep)
end

-- The row's selected look following a mark the game shows on the selected row (a Selection texture): lit while the mark is shown.
function GW.FollowMark(row, mark)
  T.SelectRow(row, type(mark) == "table" and type(mark.IsShown) == "function" and mark:IsShown() == true)
end

-- An edit box (the game's input border and all) as a theme edit box; anything that is not one is skipped.
function GW.SkinEditBox(box)
  if type(box) == "table" and box.SetText and box.GetRegions then T.EditBox(box) end
end

-- An item button whose picture is its normal texture (a mail attachment's): the slot art faded, the border in the
-- item's quality colour, the picture kept as the game sets it.
function GW.SkinPictureSlot(button)
  if type(button) ~= "table" or not button.GetRegions then return end
  local picture, keep = button.GetNormalTexture and button:GetNormalTexture(), {}
  if picture then keep[picture] = true end
  T.FadeRegions(button, keep)
  GW.SkinItem(button)
  GW.ShowTexture(picture)
end

-- A paging arrow with a caption (the inbox's Previous and Next): a theme arrow button pointing `direction`,
-- the caption beside it in small text, T.SPACE.gap clear of the arrow (the theme arrow fills the button, where
-- the game's art left room).
function GW.SkinPager(button, direction)
  if type(button) ~= "table" or not button.CreateTexture then return end
  T.ArrowButton(button, direction)
  GW.TextRegions(button, GW.PAGER_CAPTIONS, "small", "text2")
  GW.SpaceCaption(button, direction)
end

-- Sets a pager's caption (a region whose text is the game's PREV or NEXT) T.SPACE.gap past the arrow: right of a
-- left arrow, left of a right one.
function GW.SpaceCaption(button, direction)
  local left = direction == "left"
  for _, region in ipairs({ button:GetRegions() }) do
    if region.GetText and GW.IsPagerCaption(region:GetText()) then
      region:ClearAllPoints()
      region:SetPoint(left and "LEFT" or "RIGHT", button, left and "RIGHT" or "LEFT", left and T.SPACE.gap or -T.SPACE.gap, 0)
    end
  end
end

-- Whether text is one of the game's pager captions (PREV, NEXT).
function GW.IsPagerCaption(text)
  for _, name in ipairs(GW.PAGER_CAPTIONS) do
    if text ~= nil and _G[name] == text then return true end
  end
  return false
end

-- The part reached from frame by a dotted path of parentKeys ("PagedSpellsFrame.PagingControls"); nil when a step
-- is missing or is no table.
function GW.Part(frame, path)
  local part = frame
  for key in string.gmatch(path, "[^.]+") do
    if type(part) ~= "table" then return nil end
    part = part[key]
  end
  return type(part) == "table" and part or nil
end

-- Runs fn on frame[key] for each key (fn skips what is not a frame); a frame that is no table is skipped.
function GW.EachKey(frame, keys, fn)
  if type(frame) ~= "table" then return end
  for _, key in ipairs(keys) do fn(frame[key]) end
end

-- The parts of frame under those keys as a set, for T.FadeRegions' keep argument (art the game animates or the
-- window shows as content).
function GW.KeepKeys(frame, keys)
  local keep = {}
  for _, key in ipairs(keys) do
    if type(frame[key]) == "table" then keep[frame[key]] = true end
  end
  return keep
end

-- A font string in a role and a theme colour; anything that is not a font string is skipped.
function GW.SkinText(fs, role, token)
  if type(fs) == "table" and fs.SetFont then T.Text(fs, role, token) end
end

-- A paging arrow as a theme arrow button pointing `direction`; anything that is not a frame is skipped.
function GW.SkinArrow(button, direction)
  if type(button) == "table" and button.CreateTexture then T.ArrowButton(button, direction) end
end

-- A pager of two arrows and a page count (PagingControlsTemplate, the collections' paging frame: PrevPageButton,
-- NextPageButton and PageText): the arrows as theme arrow buttons, the count in small text.
function GW.SkinPaging(controls)
  if type(controls) ~= "table" then return end
  GW.SkinArrow(controls.PrevPageButton, "left")
  GW.SkinArrow(controls.NextPageButton, "right")
  GW.SkinText(controls.PageText, "small", "text2")
end

-- A dropdown whose picture is an Icon (UIPanelArrowDropdownButtonTemplate, the spellbook's settings) as a theme
-- button that keeps it.
function GW.SkinIconDropdown(dropdown)
  if type(dropdown) ~= "table" or not dropdown.CreateTexture then return end
  T.Button(dropdown)
  GW.ShowTexture(dropdown.Icon)
end

-- A dropdown whose picture is the game's yellow arrow box (UIPanelArrowDropdownButtonTemplate's Icon, the spellbook's
-- settings) as a theme button with the theme's arrow in its place.
function GW.SkinArrowDropdown(dropdown)
  if type(dropdown) ~= "table" or not dropdown.CreateTexture then return end
  T.Button(dropdown)
  GW.DropArrow(dropdown, dropdown.Icon)
end

-- The three denominations of a money input line (MoneyInputFrameTemplate: edit boxes under these keys, each with its
-- coin picture under `texture`), and of a large one (LargeMoneyInputFrameTemplate, the auction house's sell form).
GW.MONEY_INPUTS = { "gold", "silver", "copper" }
GW.LARGE_MONEY_INPUTS = { "GoldBox", "SilverBox", "CopperBox" }

-- One money input box as a theme edit box, once, with its coin picture (the part under key `coin`) shown again (the
-- theme fades the box's art, which the coin is part of; the game dims the coin itself for a long figure). A forbidden
-- box (the trade window's own) is left alone: code that touches it is tainted.
local function skinMoneyBox(box, coin)
  if type(box) ~= "table" or not box.SetText or vgMoneyBox[box] then return end
  if type(box.IsForbidden) == "function" and box:IsForbidden() then return end
  vgMoneyBox[box] = true
  T.EditBox(box)
  GW.ShowTexture(box[coin])
end

-- A money input line (the trade window's offer, the mail's send money): its three boxes as theme edit boxes. A large
-- line gives its keys (GW.LARGE_MONEY_INPUTS) and the key of its coin ("Icon").
function GW.SkinMoneyInput(line, keys, coin)
  if type(line) ~= "table" then return end
  for _, key in ipairs(keys or GW.MONEY_INPUTS) do skinMoneyBox(line[key], coin or "texture") end
end

-- Skins one window and then its inside (GW.INSIDES, by the window's name), for the windows the sections below dress.
function GW.SkinFramed(frame)
  GW.Skin(frame)
  local inside = GW.INSIDES[frame:GetName() or ""]
  if inside then inside(frame) end
end

-- The game menu -------------------------------------------------------------------------------

-- One game menu button in the theme, once: the menu takes its buttons from a
-- pool (made again on every InitButtons, reused ones keep the look), and
-- Vanguard's own button is made from the same template.
function GW.SkinMenuButton(button)
  if vgMenuSkinned[button] then return end
  vgMenuSkinned[button] = true
  T.Button(button)
end

-- The menu's header: the plate behind the title faded (nothing in the game's Lua shows or fades it again, and
-- it stays the game's own to show), the title in the title role, inside the panel.
local function dressMenuHeader(menu)
  local header = menu.Header
  if type(header) ~= "table" then return end
  GW.FadeParts(header, GW.MENU_PLATE)
  GW.SkinTitle(header.Text)
  header:SetPoint("TOP", menu, "TOP", 0, -8)
end

-- Skins the buttons the menu has now (read-only on its pool, which the game owns), Vanguard's own, and the header.
function GW.SkinMenu(menu)
  local pool = menu.buttonPool
  if type(pool) == "table" and type(pool.EnumerateActive) == "function" then
    for button in pool:EnumerateActive() do GW.SkinMenuButton(button) end
  end
  if ns.gameMenuButton then GW.SkinMenuButton(ns.gameMenuButton) end
  dressMenuHeader(menu)
end

-- The menu builds its buttons again each time it opens: skin them after each build.
local function watchGameMenu()
  local menu = _G.GameMenuFrame
  if type(menu) ~= "table" or type(hooksecurefunc) ~= "function" or type(menu.InitButtons) ~= "function" then return end
  hooksecurefunc(menu, "InitButtons", ns.Guard("hook InitButtons", GW.SkinMenu))
  GW.SkinMenu(menu)
end

-- The loot window -----------------------------------------------------------------------------

-- A loot row's card art (LootFrameElementTemplate: the card's fill and stroke, and the rarity ribbon in its
-- top-right corner), faded. The hover and pressed strokes, the quest mark and the icon stay.
GW.LOOT_ROW_ART = { "NameFrame", "BorderFrame", "QualityStripe" }

-- One row of the loot list as the game acquires it (callback of the list: owner, row, data): its card art
-- faded, its item slot in the bags' item look (a thin border in the item's quality colour), the item's
-- name and rarity in the theme font with the colours the game gives them.
local function skinLootRow(_, row)
  if type(row) ~= "table" then return end
  GW.FadeParts(row, GW.LOOT_ROW_ART)
  local bags = ns.GetModule("Bags")
  if bags and bags.SkinItem then bags.SkinItem(row.Item) end
  if type(row.Text) == "table" and row.Text.SetFont then T.Text(row.Text, "label", false) end
  if type(row.QualityText) == "table" and row.QualityText.SetFont then T.Text(row.QualityText, "tiny", false) end
end

-- The list's rows now and each row it acquires later (the game reuses its rows, one callback is enough);
-- the list is watched once. The callback is guarded: the game's list fires it inside its acquire lock, so a
-- failure in it must be reported, not raised, or the list stays locked.
local function watchLootRows(box)
  local mixin = _G.ScrollBoxListMixin
  if type(box) ~= "table" or vgLootRows[box] or type(box.RegisterCallback) ~= "function" then return end
  if type(mixin) ~= "table" or type(mixin.Event) ~= "table" then return end
  vgLootRows[box] = true
  box:RegisterCallback(mixin.Event.OnAcquiredFrame, ns.Guard("acquire loot row", skinLootRow), GW)
  if type(box.ForEachFrame) == "function" then box:ForEachFrame(function(row) skinLootRow(nil, row) end) end
end

-- The loot window: the window skin, its close button (a ClosePanelButton, which the skin does not look for), and
-- its rows as the list hands them out.
function GW.SkinLoot(frame)
  GW.Skin(frame)
  GW.DressClose(frame, frame.ClosePanelButton)
  watchLootRows(frame.ScrollBox)
end

-- The trade window ----------------------------------------------------------------------------

-- The six wells behind its item columns and money lines (InsetFrameTemplate frames that all carry the key LeftInset).
GW.TRADE_INSETS = {
  "TradeRecipientItemsInset", "TradeRecipientEnchantInset", "TradePlayerItemsInset", "TradePlayerEnchantInset",
  "TradePlayerInputMoneyInset", "TradeRecipientMoneyInset",
}
-- The two column headings (the other player's name and yours), gold in the game.
GW.TRADE_HEADS = { "TradeFrameRecipientNameText", "TradeFramePlayerNameText" }

-- One trade row, "TradePlayerItem3" or "TradeRecipientItem3": its slot and name plates faded (the enchant row's
-- icon stays) and its item button in the bags' item look.
local function skinTradeRow(name)
  local row = _G[name]
  if type(row) ~= "table" then return end
  GW.FadeParts(row, { "SlotTexture" })
  GW.FadeNamed({ name .. "NameFrame" })
  GW.SkinItem(_G[name .. "ItemButton"])
end

-- The money lines: your offer's three boxes as edit boxes, the other player's gold-edged plate faded and their
-- amount in the theme font, and the Trade button's warning icon shown again (the theme fades the button's art).
local function skinTradeMoney()
  GW.SkinMoneyInput(_G.TradePlayerInputMoneyFrame)
  GW.FadeNamed({ "TradeRecipientMoneyBg" })
  GW.SkinMoney(_G.TradeRecipientMoneyFrame)
  local trade = _G.TradeFrameTradeButton
  GW.ShowTexture(type(trade) == "table" and trade.WarningIcon or nil)
end

-- The trade window's inside: the wells as inset panels, the fourteen item rows, the money lines and the headings.
GW.INSIDES.TradeFrame = function()
  eachNamed(GW.TRADE_INSETS, GW.InsetPanel)
  for i = 1, 7 do skinTradeRow("TradePlayerItem" .. i) skinTradeRow("TradeRecipientItem" .. i) end
  skinTradeMoney()
  GW.TextNamed(GW.TRADE_HEADS, "label", "text")
end

-- The mail window ------------------------------------------------------------------------------

-- The game's strings for the To and Subject labels beside the send page's boxes.
GW.MAIL_LABELS = { "MAIL_TO_LABEL", "MAIL_SUBJECT_LABEL" }
-- The send page's two text boxes and its money radios.
GW.MAIL_BOXES = { "SendMailNameEditBox", "SendMailSubjectEditBox" }
GW.MAIL_RADIOS = { "SendMailSendMoneyButton", "SendMailCODButton" }

-- One inbox row (MailItem1-7): its plates and its item's slot plate faded, the item button in the bags' look,
-- the sender and subject in the theme font with the colours the game gives them (read mail is greyed).
local function skinMailRow(i)
  local row = _G["MailItem" .. i]
  if type(row) ~= "table" or not row.GetRegions then return end
  T.FadeRegions(row)
  GW.FadeNamed({ "MailItem" .. i .. "ButtonSlot" })
  GW.SkinItem(row.Button)
  GW.TextNamed({ "MailItem" .. i .. "Sender" }, "label", false)
  GW.TextNamed({ "MailItem" .. i .. "Subject" }, "small", false)
end

-- The inbox page: its parchment faded, the seven rows, the page arrows and the page count.
local function skinInbox()
  GW.FadeNamed({ "InboxFrameBg" })
  for i = 1, 7 do skinMailRow(i) end
  local inbox = _G.InboxFrame
  if type(inbox) ~= "table" then return end
  GW.SkinPager(inbox.PrevPageButton, "left")
  GW.SkinPager(inbox.NextPageButton, "right")
  GW.TextNamed({ "InboxCurrentPage" }, "small", "text2")
end

-- The send page's two bronze bars: every texture of the page that shows the first bar's picture (the named left
-- halves and the unnamed right halves) as one pixel of the divider colour.
local function skinMailBars(page)
  local first = type(_G.SendMailHorizontalBarLeft) == "table" and _G.SendMailHorizontalBarLeft
  if not first or not first.GetTexture or not page.GetRegions then return end
  for _, region in ipairs({ page:GetRegions() }) do
    if region.GetTexture and region:GetTexture() == first:GetTexture() then T.Divider(region) end
  end
end

-- The send page's letter: the stationery faded and the scroll frame an inset panel, the body in light text
-- (the game draws it dark for the parchment), the To and Subject boxes as theme edit boxes with their labels.
local function skinLetter()
  GW.InsetPanel(_G.SendMailScrollFrame)
  GW.PaintNamed({ "SendMailBodyEditBox" }, "text")
  eachNamed(GW.MAIL_BOXES, function(box)
    GW.SkinEditBox(box)
    GW.TextRegions(box, GW.MAIL_LABELS, "small", "text")
  end)
end

-- The send page's money: the amount boxes, the radios, the well and its plate, the amount label and both money lines.
local function skinSendMoney()
  GW.SkinMoneyInput(_G.SendMailMoney)
  eachNamed(GW.MAIL_RADIOS, GW.SkinRadio)
  GW.InsetPanel(_G.SendMailMoneyInset)
  GW.FadeNamed({ "SendMailMoneyBg" })
  GW.TextNamed({ "SendMailMoneyText" }, "small", "text")
  GW.SkinMoney(_G.SendMailMoneyFrame)
  GW.SkinMoney(_G.SendMailCostMoneyFrame)
end

-- The mail window's inside: the inbox, then the send page (its bars, letter, money and sixteen attachment slots).
GW.INSIDES.MailFrame = function()
  skinInbox()
  skinMailBars(_G.SendMailFrame or {})
  skinLetter()
  skinSendMoney()
  for i = 1, 16 do GW.SkinPictureSlot(_G["SendMailAttachment" .. i]) end
end

-- The group loot rolls ------------------------------------------------------------------------

-- A roll window's four buttons (the dice, coin and pass keys of LootButtonContainer).
GW.LOOT_ROLLS = { "NeedButton", "GreedButton", "PassButton", "TransmogButton" }

-- One roll window's inside: its four buttons on control tiles (the game sets their icons), the countdown as a
-- flat track, and the item's icon in the item look (the game's quality ring faded: the item's name keeps its colour).
local function rollInside(frame)
  local box = frame.LootButtonContainer
  for _, key in ipairs(GW.LOOT_ROLLS) do GW.SkinPlate(type(box) == "table" and box[key] or nil) end
  GW.SkinProgress(frame.Timer)
  if type(frame.IconFrame) ~= "table" then return end
  GW.FadeParts(frame.IconFrame, { "Border" })
  GW.SkinItem(frame.IconFrame)
end
for i = 1, 4 do GW.INSIDES["GroupLootFrame" .. i] = rollInside end

-- Popups and the ready check ------------------------------------------------------------------

-- A popup's text box (a tooltip-backdrop edit box) as a theme edit box, the backdrop's nine-slice faded.
local function skinPopupBox(box)
  GW.SkinEditBox(box)
  if type(box) == "table" and type(box.NineSlice) == "table" and box.NineSlice.SetAlpha then box.NineSlice:SetAlpha(0) end
end

-- A popup's item (the item to hand over: a name plate and an item button): the plate faded, the item look.
local function skinPopupItem(frame)
  local holder = frame.ItemFrame
  if type(holder) ~= "table" then return end
  GW.FadeParts(holder, { "NameFrame" })
  GW.SkinItem(holder.Item)
end

-- The popups whose first button destroys something (an item, a letter, money, a quest, a profession): that
-- button's label takes the danger colour, as Vanguard's own Abandon does.
GW.DANGER_POPUPS = {
  DELETE_ITEM = true, DELETE_GOOD_ITEM = true, DELETE_QUEST_ITEM = true, DELETE_GOOD_QUEST_ITEM = true, DELETE_MAIL = true,
  DELETE_MONEY = true, ABANDON_QUEST = true, ABANDON_QUEST_WITH_ITEMS = true, UNLEARN_SKILL = true,
}

-- The first button's scripts after which its paint is put back (the game's hover and enable changes).
GW.CONFIRM_SCRIPTS = { "OnEnter", "OnLeave", "OnEnable" }

do
  -- The popup each hooked first button belongs to; the buttons painted in the danger colour now, each with its
  -- label's colour from before (the fallback when the button has no normal font object).
  local vgConfirmOf = ns.FrameState("vgConfirmOf")
  local vgDanger = ns.FrameState("vgDanger")

  -- Gives a popup's first button back the game's colour, once it is enabled: its normal font object's (the label's
  -- own colour may be the red a destroy popup left on this reused frame), else the colour from before the paint.
  -- The numeric T.ColorRGB drops the danger token, so a theme refresh doesn't paint it red again.
  local function unpaint(button, label)
    if not (vgDanger[button] and button:IsEnabled()) then return end
    local font = button:GetNormalFontObject()
    local c = font and { font:GetTextColor() } or vgDanger[button]
    vgDanger[button] = nil
    T.ColorRGB(label, c[1], c[2], c[3])
  end

  -- Paints a popup's first button: the danger colour while it is enabled on a destroy popup (GW.DANGER_POPUPS),
  -- else the game's own. Only the label's colour changes; the shared font object never does.
  local function paintConfirm(button)
    local popup, label = vgConfirmOf[button], button:GetFontString()
    if not (popup and label) then return end
    if not (GW.DANGER_POPUPS[popup.which] and button:IsEnabled()) then return unpaint(button, label) end
    vgDanger[button] = vgDanger[button] or { label:GetTextColor() }
    T.Color(label, "bad")
  end

  -- The popup's first button (ButtonContainer.Button1), hooked once (the paint is put back after the game's own
  -- hover and enable changes, and the theme's disabled look) and painted for the popup now showing.
  function GW.PaintPopupConfirm(frame)
    local button = type(frame.ButtonContainer) == "table" and frame.ButtonContainer.Button1
    if type(button) ~= "table" or type(button.GetNormalFontObject) ~= "function" then return end
    vgConfirmOf[button] = frame
    for _, script in ipairs(GW.CONFIRM_SCRIPTS) do GW.HookScriptOnce(button, script, "paint popup confirm", paintConfirm) end
    paintConfirm(button)
  end
end

-- The controls a popup shows when it has them, in the theme: its dark tile faded, the text box, the money
-- boxes and line, the dropdown, the fifth button and the item, and a destroy popup's first button in the danger
-- colour. Its buttons and close button are the window skin's.
local function popupInside(frame)
  GW.FadeParts(frame, { "BG" })
  skinPopupBox(frame.EditBox)
  GW.SkinMoneyInput(frame.MoneyInputFrame)
  GW.SkinMoney(frame.MoneyFrame)
  GW.SkinDropdown(frame.Dropdown)
  GW.SkinButton(frame.ExtraButton)
  skinPopupItem(frame)
  GW.PaintPopupConfirm(frame)
end
for _, name in ipairs(GW.POPUPS) do GW.INSIDES[name] = popupInside end

-- The ready check's dialog is a child of its holder (ReadyCheckListenerFrame): its dark tile and border faded
-- (the portrait of who called it stays), its title in the title role, its prompt in light text, its Yes and No buttons themed. The panel
-- the window skin painted on the holder sits behind it.
GW.INSIDES.ReadyCheckFrame = function()
  local listener = _G.ReadyCheckListenerFrame
  if type(listener) ~= "table" then return end
  GW.FadeParts(listener, { "Bg", "NineSlice" })
  if type(listener.NineSlice) == "table" and listener.NineSlice.SetAlpha then listener.NineSlice:SetAlpha(0) end
  GW.SkinTitle(type(listener.TitleContainer) == "table" and listener.TitleContainer.TitleText or nil)
  GW.SkinButton(listener.YesButton)
  GW.SkinButton(listener.NoButton)
  GW.TextNamed({ "ReadyCheckFrameText" }, "label", "text")
end

-- The dressing room ---------------------------------------------------------------------------

-- The two side panels of the outfit controls (a list of sets, and the details of a custom set).
GW.DRESS_PANELS = { "SetSelectionPanel", "CustomSetDetailsPanel" }

-- The outfit controls on the dressing room's model: the outfit dropdown and its Save button, the Link button, the
-- details toggle and the two side panels. Each is skipped when the client lacks it.
local function dressControls(frame)
  GW.SkinDropdown(frame.CustomSetDropdown)
  GW.SkinButton(type(frame.CustomSetDropdown) == "table" and frame.CustomSetDropdown.SaveButton or nil)
  GW.SkinButton(frame.LinkButton)
  GW.SkinPlate(frame.ToggleCustomSetDetailsButton)
  for _, key in ipairs(GW.DRESS_PANELS) do GW.InsetPanel(frame[key]) end
end

-- The dressing room's inside: the model's painted backdrop an inset, then its outfit controls (Cancel and Reset
-- are in GW.EXTRA_BUTTONS).
GW.INSIDES.DressUpFrame = function(frame)
  GW.InsetPanel(frame.ModelScene)
  dressControls(frame)
end

-- The time manager -----------------------------------------------------------------------------

-- The three captions over the time manager's controls (alarm time, alarm message, show the stopwatch).
GW.TIME_LABELS = { "TimeManagerAlarmTimeLabel", "TimeManagerAlarmMessageLabel", "TimeManagerStopwatchFrameText" }
-- The alarm time's three dropdowns, under the AlarmTimeFrame.
GW.TIME_DROPDOWNS = { "HourDropdown", "MinuteDropdown", "AMPMDropdown" }

-- The alarm time's hour, minute and AM/PM dropdowns as theme dropdowns that keep their arrows.
local function timeDropdowns(frame)
  local box = frame.AlarmTimeFrame
  if type(box) ~= "table" then return end
  for _, key in ipairs(GW.TIME_DROPDOWNS) do GW.SkinDropdown(box[key]) end
end

-- The time manager's inside: its three check boxes (only the ones directly on the window: the stopwatch's sits a
-- frame down and keeps its clock icon on a control tile), the alarm dropdowns and message box, the captions and
-- the window's own title line (an unnamed string, gold in the game).
GW.INSIDES.TimeManagerFrame = function(frame)
  GW.DressChecks(frame, 1)
  GW.SkinPlate(_G.TimeManagerStopwatchCheck)
  timeDropdowns(frame)
  GW.SkinEditBox(_G.TimeManagerAlarmMessageEditBox)
  GW.TextNamed(GW.TIME_LABELS, "small", "text")
  GW.PaintNamed({ "TimeManagerAlarmEnabledButtonText" }, "text")
  GW.TextRegions(frame, { "TIMEMANAGER_TITLE" }, "heading", "text")
end

-- Books and letters ---------------------------------------------------------------------------

-- A book or letter's inside: the page area an inset (its parchment is faded with the text, GW.LightItemText),
-- the page arrows and the reading bar, and the page count in small text.
GW.INSIDES.ItemTextFrame = function()
  GW.InsetPanel(_G.ItemTextScrollFrame)
  GW.SkinPager(_G.ItemTextPrevPageButton, "left")
  GW.SkinPager(_G.ItemTextNextPageButton, "right")
  GW.SkinProgress(_G.ItemTextStatusBar)
  GW.TextNamed({ "ItemTextCurrentPage" }, "small", "text2")
end

-- The quest and gossip windows ----------------------------------------------------------------

-- The four pages of the quest window (QuestFramePanelTemplate: a parchment and its material art on each).
GW.QUEST_PANELS = { "QuestFrameRewardPanel", "QuestFrameProgressPanel", "QuestFrameDetailPanel", "QuestFrameGreetingPanel" }

-- One required-item tile of the turn-in page (QuestProgressItem1-6, LargeItemButtonTemplate): its name plate
-- faded, the item look on the button, the name in the theme font with the colour the game gives it.
local function skinQuestItem(i)
  local item = _G["QuestProgressItem" .. i]
  if type(item) ~= "table" then return end
  GW.FadeParts(item, { "NameFrame" })
  GW.SkinItem(item)
  GW.TextNamed({ "QuestProgressItem" .. i .. "Name" }, "label", false)
end

-- The quest window's inside: the parchment of its four pages faded (the window's inset stays behind the text),
-- the six required items and the required money line. Its six push buttons are in GW.EXTRA_BUTTONS.
GW.INSIDES.QuestFrame = function()
  eachNamed(GW.QUEST_PANELS, GW.FadeArt)
  for i = 1, 6 do skinQuestItem(i) end
  GW.SkinMoney(_G.QuestProgressRequiredMoneyFrame)
end

-- The gossip window's inside: the greeting panel's parchment faded and its Goodbye button a theme button.
GW.INSIDES.GossipFrame = function(frame)
  local panel = frame.GreetingPanel
  GW.FadeArt(panel)
  GW.SkinButton(type(panel) == "table" and panel.GoodbyeButton or nil)
end

-- The spellbook and the talents ----------------------------------------------------------------

-- The talent tree's art that stays: the clouds and particles drifting over it and the effects played when
-- changes are applied (the game animates their alpha).
GW.TALENT_FX = {
  "Clouds1", "Clouds2", "AirParticlesClose", "AirParticlesFar", "ActivationExpandFx", "ActivationTitansFX",
  "ActivationClassFx", "ActivationClassFx2", "ActivationClassFx3", "ActivationClassFx4",
}
-- The talent page's push buttons by key (apply, copy an inspected build), and its two icon buttons (reset, undo).
GW.TALENT_BUTTONS = { "ApplyButton", "InspectCopyButton" }
GW.TALENT_ICONS = { "ResetButton", "UndoButton" }

-- The spellbook's page methods that fill the pages with entries and section heads (PagedContentFrame and the book's
-- own); each is looked for on both, and one the client lacks is skipped.
GW.BOOK_REFILLS = { "SetDataProvider", "SetCurrentPage", "UpdateFrames", "UpdateDisplay" }

-- The icon button of a book entry: its bronze laurel frame and other art faded (the icon and the game's hover
-- highlight kept; a Legacy challenge's icon frame holds its picture as texture), the icon cropped and a thin inset
-- border round it, like an item slot.
local function dressBookIcon(button)
  if type(button) ~= "table" or not button.GetRegions or not button.CreateTexture then return end
  T.FadeRegions(button, GW.KeepKeys(button, { "Icon", "icon", "texture", "IconHighlight", "Highlight" }))
  local icon = button.Icon or button.icon or button.texture
  if type(icon) == "table" and icon.SetTexCoord then T.Crop(icon) end
  T.Panel(button, { inset = true, noBg = true })
end
GW.DressIcon = dressBookIcon

-- One spell entry of the book (a name, a rank line and an icon button on a smudged plate): the plate faded, the
-- icon in the item-slot look, the name and rank in the theme's text roles (the game colours them for parchment,
-- dark brown on the dark panel).
local function dressBookEntry(entry)
  GW.FadeParts(entry, { "Backplate" })
  dressBookIcon(entry.Button)
  GW.SkinText(entry.Name, "label", "text")
  GW.SkinText(entry.SubName, "small", "muted")
end

-- One section head of the book (a name over a rule, on a smudged plate): the plate and rule faded, the name a heading.
local function dressBookHead(head)
  GW.FadeArt(head)
  GW.SkinText(head.Text, "heading", "text")
end

-- Every entry and section head under part, up to depth frames down; an entry has a Name, a head a Text and no Name.
local function dressBookPages(part, depth)
  if type(part) ~= "table" or not part.GetChildren then return end
  for _, child in ipairs({ part:GetChildren() }) do
    if type(child.Name) == "table" then dressBookEntry(child)
    elseif type(child.Text) == "table" and child.Text.SetFont then dressBookHead(child) end
    if depth > 1 then dressBookPages(child, depth - 1) end
  end
end

-- The book's pages dressed now and after each refill (the game makes and recolours the entries as it fills a page,
-- so this runs after it), once per method and frame.
local function watchBookPages(book)
  local paged = book.PagedSpellsFrame
  if type(paged) ~= "table" or not paged.HookScript then return end
  -- Dresses the entries and heads the pages hold now.
  local function dress() dressBookPages(paged, 4) end
  GW.HookScriptOnce(paged, "OnShow", "book pages", dress)
  for _, name in ipairs(GW.BOOK_REFILLS) do
    GW.HookAfter(paged, name, dress)
    GW.HookAfter(book, name, dress)
  end
  dress()
end

-- The spellbook: its parchment (top bar, pages, bookmark, corner) faded, the page area an inset, the search box,
-- the settings dropdown (the theme's arrow), the page arrows with their count and the entries and section heads on the
-- pages in the theme.
local function skinSpellBook(book)
  if type(book) ~= "table" or not book.GetRegions then return end
  watchBookPages(book)
  T.FadeRegions(book)
  GW.InsetPanel(book.PagedSpellsFrame)
  GW.SkinSearch(book.SearchBox)
  GW.SkinArrowDropdown(book.SettingsDropdown)
  GW.SkinPaging(GW.Part(book, "PagedSpellsFrame.PagingControls"))
end

-- The talent tree's painted backdrop, bronze frame and dividers faded (its clouds, particles and activation
-- effects stay) and the tree an inset; the tree's buttons are content.
local function skinTalentBackdrop(talents)
  T.FadeRegions(talents, GW.KeepKeys(talents, GW.TALENT_FX))
  T.Panel(talents, { inset = true, noSheen = true })
  local currency = talents.ClassCurrencyDisplay
  if type(currency) == "table" then GW.FadeParts(currency, { "Border" }) end
end

-- The talent page's controls: push buttons, the activate button, the search box and its options, the loadout
-- dropdown and the reset and undo buttons (which keep their pictures on control tiles).
local function skinTalentControls(talents)
  GW.EachKey(talents, GW.TALENT_BUTTONS, GW.SkinButton)
  GW.EachKey(talents, GW.TALENT_ICONS, GW.SkinPlate)
  GW.SkinButton(GW.Part(talents, "ActiveSpec.ActivateButton"))
  GW.SkinSearch(talents.SearchBox)
  GW.SkinDropdown(talents.SearchOptionsDropdown)
  GW.SkinDropdown(GW.Part(talents, "LoadSystem.Dropdown"))
end

-- The spellbook and the talents' insides. The spec cards and the hero talents are left as the game draws them.
GW.INSIDES.PlayerSpellsFrame = function(frame)
  skinSpellBook(frame.SpellBookFrame)
  local talents = frame.TalentsFrame
  if type(talents) ~= "table" or not talents.GetRegions then return end
  skinTalentBackdrop(talents)
  skinTalentControls(talents)
end

-- The professions window and the recipe form ---------------------------------------------------------

-- Runs fn(frame, ...) after the frame's game method `name` each time it runs (the call's own arguments follow the
-- frame), once per frame and method; a frame without the method is skipped. A post-hook: the game's function is kept.
function GW.HookAfter(frame, name, fn)
  if type(frame) ~= "table" or type(frame[name]) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgHooked[frame] = vgHooked[frame] or {}
  if vgHooked[frame][name] then return end
  vgHooked[frame][name] = true
  hooksecurefunc(frame, name, ns.Guard("hook " .. name, fn))
end

-- Hooks fn into the frame's script `script` (under ns.Guard as `where`) once per frame and script, however often the
-- skin that asks for it runs; a frame without HookScript is skipped. Hooks cannot be taken off, so a repeat would pile up.
function GW.HookScriptOnce(frame, script, where, fn)
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" then return end
  vgHooked[frame] = vgHooked[frame] or {}
  if vgHooked[frame]["script:" .. script] then return end
  vgHooked[frame]["script:" .. script] = true
  frame:HookScript(script, ns.Guard(where, fn))
end

-- A frame faded as a whole by its alpha (a nine-slice frame whose pieces the game lays out); skipped when it is no frame.
function GW.FadeFrame(part)
  if type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
end

-- The recipe form's two check boxes by key (track the recipe, use the best reagents), and the crafting page's
-- profession gear slots (a tool and up to two accessories for each profession, cooking and fishing).
GW.FORM_CHECKS = { "TrackRecipeCheckbox", "AllocateBestQualityCheckbox" }
GW.PROF_SLOTS = {
  "Prof0ToolSlot", "Prof0Gear0Slot", "Prof0Gear1Slot", "Prof1ToolSlot", "Prof1Gear0Slot", "Prof1Gear1Slot",
  "CookingToolSlot", "CookingGear0Slot", "FishingToolSlot", "FishingGear0Slot", "FishingGear1Slot",
}
-- The crafting page's push buttons by key (view guild crafters, and the Create and Create All buttons it makes itself).
GW.PROF_BUTTONS = { "ViewGuildCraftersButton", "CreateButton", "CreateAllButton" }

-- One of the form's check boxes as a theme check box, its label in small text; a part that is no check button is skipped.
local function skinFormCheck(box)
  if type(box) ~= "table" or not box.CreateTexture or not box.GetChecked then return end
  T.CheckBox(box)
  GW.SkinText(box.Text, "small", "text")
end

-- One reagent slot (an item button and its name) in the bags' item look, its name in small text (its colour is the
-- game's: it says whether the reagent is missing).
local function skinReagentSlot(slot)
  if type(slot) ~= "table" then return end
  GW.SkinItem(slot.Button)
  GW.SkinText(slot.Name, "small", false)
end

-- Every reagent slot the form holds (form.reagentSlots: a list of slots for each section of the recipe).
local function skinReagentSlots(form)
  if type(form.reagentSlots) ~= "table" then return end
  for _, slots in pairs(form.reagentSlots) do
    for _, slot in ipairs(type(slots) == "table" and slots or {}) do skinReagentSlot(slot) end
  end
end

-- The form's gold notes (what the recipe makes, why it is locked, the first-craft bonus) in the text colour.
local function skinFormNotes(form)
  GW.SkinText(form.OutputSubText, "label", "text")
  GW.SkinText(GW.Part(form, "RecipeSourceButton.Text"), "label", "text")
  GW.SkinText(GW.Part(form, "FirstCraftBonus.Text"), "label", "text")
end

-- The recipe form (ProfessionsRecipeSchematicFormTemplate), shared by the crafting page and the inspect window: its
-- parchment and bronze frame faded for an inset, its check boxes, level dropdown and notes in the theme, and each
-- reagent slot the game fills in when it shows a recipe (a hook on Init) in the item look. The crafted item's
-- round icon stays the game's.
function GW.SkinSchematicForm(form)
  if type(form) ~= "table" or not form.GetRegions then return end
  GW.InsetPanel(form)
  GW.EachKey(form, GW.FORM_CHECKS, skinFormCheck)
  GW.SkinDropdown(form.RecipeLevelDropdown)
  skinFormNotes(form)
  skinReagentSlots(form)
  GW.HookAfter(form, "Init", function() skinReagentSlots(form) end)
end

-- A recipe row (ProfessionsRecipeListRecipeTemplate) as a selectable theme row: the game's selected and hover
-- overlays faded, the selected look following the game's SetSelected. Category and divider rows, which have no
-- SetSelected, stay as the game draws them.
local function skinRecipeRow(row)
  if type(row) ~= "table" or type(row.SetSelected) ~= "function" or not row.CreateTexture then return end
  T.Row(row, { fade = true })
  local overlay = row.SelectedOverlay
  T.SelectRow(row, type(overlay) == "table" and overlay.IsShown and overlay:IsShown() or false)
  GW.HookAfter(row, "SetSelected", function(_, selected) T.SelectRow(row, selected and true or false) end)
end

-- The recipe list: its dark tile and bronze frame faded for an inset, the filter, search box and rows in the theme.
local function skinRecipeList(list)
  if type(list) ~= "table" or not list.GetRegions then return end
  GW.InsetPanel(list)
  GW.FadeFrame(list.BackgroundNineSlice)
  GW.SkinDropdown(list.FilterDropdown)
  GW.SkinSearch(list.SearchBox)
  GW.SkinText(list.NoResultsText, "label", "text")
  GW.WatchRows(list.ScrollBox, skinRecipeRow)
end

-- The crafting page's controls: the skill bar, the quantity box, the push buttons, the link dropdown (a picture),
-- the eleven gear slots and the divider between them and the rest.
local function skinCraftingControls(page)
  GW.SkinRankBar(page.RankBar)
  GW.SkinEditBox(page.CreateMultipleInputBox)
  GW.SkinSearch(page.MinimizedSearchBox)
  GW.EachKey(page, GW.PROF_BUTTONS, GW.SkinButton)
  GW.SkinIconDropdown(page.LinkButton)
  GW.EachKey(page, GW.PROF_SLOTS, GW.SkinItem)
  GW.FadeArt(page.GearSlotDivider)
end

-- The professions window's crafting page: the page's own texture faded, the recipe list, the recipe form and the
-- controls. The book page, the guild list, the output log and the side tabs are left as they are.
GW.INSIDES.ProfessionsFrame = function(frame)
  local page = frame.CraftingPage
  if type(page) ~= "table" or not page.GetRegions then return end
  T.FadeRegions(page)
  skinRecipeList(page.RecipeList)
  GW.SkinSchematicForm(page.SchematicForm)
  skinCraftingControls(page)
end

-- The window that shows a recipe another player linked: the form alone.
GW.INSIDES.InspectRecipeFrame = function(frame)
  GW.SkinSchematicForm(frame.SchematicForm)
end

-- The inspect window and the flight map's border -----------------------------------------------------

-- The inspect window's lines over the model (the inspected player's title and guild, gold in the game).
GW.INSPECT_TEXTS = { "InspectTitleText", "InspectGuildText" }

-- One inspect gear slot (Inspect<name>Slot; a slot the client lacks is skipped) in the bags' item look, the bronze
-- frame the game keeps in a child of the button faded.
local function skinInspectSlot(name)
  local button = _G["Inspect" .. name .. "Slot"]
  if type(button) ~= "table" then return end
  GW.SkinItem(button)
  GW.FadeParts(button, { "BorderFrame" })
end

-- The inspect window's inside: the model's painted backdrop and bronze frame an inset, the gear slots, the View in
-- Dressing Room button, and the level, title and guild lines. The tabs are in GW.TAB_WINDOWS.
GW.INSIDES.InspectFrame = function()
  GW.InsetPanel(_G.InspectModelFrame)
  for _, name in ipairs(GW.EQUIP_SLOTS) do skinInspectSlot(name) end
  local paper = _G.InspectPaperDollFrame
  GW.SkinButton(type(paper) == "table" and paper.ViewButton or nil)
  GW.TextNamed(GW.INSPECT_TEXTS, "small", "text2")
  GW.TextNamed({ "InspectLevelText" }, "heading", "text")
end

-- The flight map's frame is a child (BorderFrame, a PortraitFrameTemplate over the whole map): its edge painted
-- without a fill (the map shows through; the window behind it has the shadow), its art, portrait and underlay
-- faded, its close button and title in the theme.
GW.INSIDES.FlightMapFrame = function(frame)
  local border = frame.BorderFrame
  if type(border) ~= "table" or not border.GetRegions then return end
  T.Panel(border, { noBg = true })
  GW.Skin(border)
end

-- The guild bank -------------------------------------------------------------------------------------

-- How many columns of slots the bank has (Column1 ... 7) and how many item buttons each holds (Button1 ... 14).
GW.BANK_COLUMNS = 7
GW.BANK_SLOTS = 14
-- The bank's push buttons by key (the purchase and save buttons sit inside BuyInfo and Info).
GW.BANK_BUTTONS = { "DepositButton", "WithdrawButton" }
-- The gold labels the bank keeps as globals: your withdrawal limit for money, and what a new tab costs.
GW.BANK_LABELS = { "GuildBankMoneyLimitLabel", "GuildBankFrameTabCost" }

-- One column of slots: its slot-grid art faded for an inset, each item button in the bags' item look.
local function skinBankColumn(column)
  if type(column) ~= "table" then return end
  GW.InsetPanel(column)
  for i = 1, GW.BANK_SLOTS do GW.SkinItem(column["Button" .. i]) end
end

-- The three money lines (the bank's balance, your withdrawal allowance, the cost of a new tab) in the theme font,
-- the gold-edged plate behind them an inset.
local function skinBankMoney(frame)
  GW.SkinMoney(frame.MoneyFrame)
  GW.SkinMoney(frame.WithdrawMoneyFrame)
  GW.SkinMoney(_G.GuildBankFrameTabCostMoneyFrame)
  GW.InsetPanel(frame.MoneyFrameBG)
end

-- The deposit, withdraw, purchase and save buttons, the item search box, and the tab info and log areas as insets
-- (the log's message frame, not the 10 unit frame that holds it).
local function skinBankControls(frame)
  GW.EachKey(frame, GW.BANK_BUTTONS, GW.SkinButton)
  GW.SkinButton(GW.Part(frame, "BuyInfo.PurchaseButton"))
  GW.SkinButton(GW.Part(frame, "Info.SaveButton"))
  GW.SkinSearch(_G.GuildItemSearchBox)
  GW.InsetPanel(GW.Part(frame, "Info.ScrollFrame"))
  GW.InsetPanel(GW.Part(frame, "Log.MessageFrame"))
end

-- The tab's name over the grid (its plate faded with the window's art) in heading text, the limit labels in small
-- grey text and the notice for a bank without tabs in the text colour.
local function skinBankTexts(frame)
  GW.SkinText(frame.TabTitle, "heading", "text")
  GW.SkinText(frame.LimitLabel, "small", "text2")
  GW.SkinText(frame.ErrorMessage, "label", "text")
  GW.TextNamed(GW.BANK_LABELS, "small", "text2")
end

-- The guild bank's inside: seven columns of slots, the money lines, the controls and the texts. The side tabs are
-- dressed in Modules/WindowsTabs.lua, the portrait stays (GW.CONTENT_ART).
GW.INSIDES.GuildBankFrame = function(frame)
  for i = 1, GW.BANK_COLUMNS do skinBankColumn(frame["Column" .. i]) end
  skinBankMoney(frame)
  skinBankControls(frame)
  skinBankTexts(frame)
end

-- The collections journals ----------------------------------------------------------------------------

-- The journals' pages (children of CollectionsJournal; the appearances page is dressed in Modules/WindowsTabs.lua).
GW.JOURNAL_PAGES = { "MountJournal", "PetJournal", "ToyBox", "HeirloomsJournal" }
-- The wells on a page (the mount and pet journals' list and display), the count plates (mounts, pets, toys) and the
-- keys a search box, a dropdown and a push button are found under on a page.
GW.JOURNAL_INSETS = { "LeftInset", "BottomLeftInset", "RightInset", "iconsFrame" }
GW.JOURNAL_COUNTS = { "MountCount", "PetCount", "ProgressTracker" }
GW.JOURNAL_SEARCH = { "searchBox", "SearchBox" }
GW.JOURNAL_DROPDOWNS = { "FilterDropdown", "ClassDropdown" }
GW.JOURNAL_BUTTONS = { "MountButton", "SummonButton" }

-- A count plate (CollectionsCountTemplate: a label and a figure on an inset frame) an inset, its gold label in small
-- grey text; anything that is not a frame is skipped.
local function skinJournalCount(count)
  if type(count) ~= "table" then return end
  GW.InsetPanel(count)
  GW.SkinText(count.Label, "small", "text2")
end

-- One journal page: its wells and leather grid as insets, its count plates and collected-count bar, search box,
-- dropdowns, action button and page arrows in the theme.
local function skinJournal(page)
  if type(page) ~= "table" then return end
  GW.EachKey(page, GW.JOURNAL_INSETS, GW.InsetPanel)
  GW.EachKey(page, GW.JOURNAL_COUNTS, skinJournalCount)
  GW.SkinProgress(page.progressBar)
  GW.EachKey(page, GW.JOURNAL_SEARCH, GW.SkinSearch)
  GW.EachKey(page, GW.JOURNAL_DROPDOWNS, GW.SkinDropdown)
  GW.EachKey(page, GW.JOURNAL_BUTTONS, GW.SkinButton)
  GW.SkinPaging(page.PagingFrame)
end

-- The mount, pet, toy and heirloom journals, each skipped when this client does not show it. The list rows of the
-- mount and pet journals stay as the game draws them.
function GW.DressJournals()
  for _, name in ipairs(GW.JOURNAL_PAGES) do skinJournal(_G[name]) end
end

-- The achievements window ------------------------------------------------------------------------------
-- (Forever may send the game's achievements key to the Legacy challenges window instead; this skin is for the window
-- when the game does show it.)

-- The list areas the game draws as a dark tile inside a gold tooltip border, as globals: the achievements and stats
-- lists, the summary page and the comparison page.
GW.ACH_AREAS = { "AchievementFrameAchievements", "AchievementFrameStats", "AchievementFrameSummary", "AchievementFrameComparison" }
-- The two headers of the summary page (a gold plate and its title), as globals, and how many category bars it has.
GW.ACH_HEADS = { "AchievementFrameSummaryAchievementsHeader", "AchievementFrameSummaryCategoriesHeader" }
GW.ACH_BARS = 12
-- What an achievement card keeps of the art it fades: the expand mark and the tracked mark.
GW.ACH_KEEP = { "Check", "PlusMinus" }

-- A section head over rows (small grey capitals): the section role in the secondary text colour, the text it has now
-- in capitals; anything that is not a font string is skipped.
function GW.SkinSection(fs)
  if type(fs) ~= "table" or not fs.SetFont then return end
  T.Text(fs, "section", "text2")
  local text = fs.GetText and fs:GetText()
  if type(text) == "string" then T.SetText(fs, text) end
end

-- A list area: its dark tile, watermark and gold border faded for an inset. The border is a frame of its own over
-- the area (a child with a NineSlice), found among the area's direct children.
local function skinAchievementArea(area)
  if type(area) ~= "table" or not area.GetChildren then return end
  GW.InsetPanel(area)
  for _, child in ipairs({ area:GetChildren() }) do GW.FadeFrame(child.NineSlice) end
end

-- An achievement card (a list row, a comparison card): its parchment, title bar, glow and corners faded with its
-- gold border; the parts named in keep (and the icon and shield, which are frames) stay.
local function fadeCard(card, keep)
  if type(card) ~= "table" or not card.GetRegions then return end
  T.FadeRegions(card, keep)
  GW.FadeFrame(card.NineSlice)
end

-- A card's description in the text colour (the game makes a completed one black for its parchment).
local function lightDescription(card)
  local text = card.Description
  if type(text) == "table" and text.SetTextColor then T.Color(text, "text") end
end

-- One achievement row: the card faded, the track check box a theme check box, the description light now and after
-- the game paints it as completed (Saturate).
local function skinAchievementRow(row)
  if type(row) ~= "table" or not row.GetRegions then return end
  fadeCard(row, GW.KeepKeys(row, GW.ACH_KEEP))
  if type(row.Tracked) == "table" and row.Tracked.GetChecked then T.CheckBox(row.Tracked) end
  lightDescription(row)
  GW.HookAfter(row, "Saturate", lightDescription)
end

-- One category row (a frame holding the Button the player clicks): the button a selectable row whose selected look
-- follows the game's UpdateSelectionState, its label in the text colour as the game sets it for each category.
local function skinCategoryRow(row)
  local button = type(row) == "table" and row.Button
  if type(button) ~= "table" or not button.CreateTexture then return end
  T.Row(button, { fade = true })
  GW.HookAfter(row, "UpdateSelectionState", function(_, selected) T.SelectRow(button, selected and true or false) end)
  GW.HookAfter(row, "Init", function() GW.SkinText(button.Label, "label", "text") end)
end

-- One comparison row: the player's card and the friend's.
local function skinComparisonRow(row)
  if type(row) ~= "table" then return end
  fadeCard(row.Player)
  fadeCard(row.Friend)
end

-- Every pooled list the window has: the categories, the achievements, the statistics and the comparison's two lists.
local function watchAchievementRows(frame)
  GW.WatchRows(GW.Part(frame, "Categories.ScrollBox"), skinCategoryRow)
  GW.WatchRows(GW.Part(_G, "AchievementFrameAchievements.ScrollBox"), skinAchievementRow)
  GW.WatchRows(GW.Part(_G, "AchievementFrameStats.ScrollBox"), GW.FadeArt)
  GW.WatchRows(GW.Part(_G, "AchievementFrameComparison.AchievementContainer.ScrollBox"), skinComparisonRow)
  GW.WatchRows(GW.Part(_G, "AchievementFrameComparison.StatContainer.ScrollBox"), GW.FadeArt)
end

-- One of the summary page's headers (a gold plate and its title, by the header's global name): the plate faded, the
-- title a section head.
local function skinSummaryHead(name)
  GW.FadeArt(_G[name])
  GW.SkinSection(_G[name .. "Title"])
end

-- The summary page's bars: the completed bar and the twelve category bars flat on dark tracks, and the comparison's
-- two cards (player and friend) with theirs.
local function skinSummaryBars()
  GW.SkinProgress(_G.AchievementFrameSummaryCategoriesStatusBar)
  for i = 1, GW.ACH_BARS do GW.SkinProgress(_G["AchievementFrameSummaryCategoriesCategory" .. i]) end
  for _, key in ipairs({ "Player", "Friend" }) do
    local card = GW.Part(_G, "AchievementFrameComparison.Summary." .. key)
    fadeCard(card)
    GW.SkinProgress(card and card.StatusBar)
  end
end

-- The search preview under the search box: the game's frame and rows' border faded for a tooltip panel.
local function skinSearchPreview(box)
  local list = type(box) == "table" and box.SearchPreviewContainer
  if type(list) ~= "table" or not list.GetRegions then return end
  T.FadeRegions(list)
  T.Tooltip(list)
end

-- The row under the title: its streaks faded, the Back button, the filter, the search box with its preview and the
-- progress bar that shows while it searches.
local function skinAchievementHeader(details)
  if type(details) ~= "table" or not details.GetRegions then return end
  T.FadeRegions(details)
  GW.SkinButton(details.Back)
  GW.SkinDropdown(GW.Part(details, "Filters.FilterDropdown"))
  GW.SkinSearch(GW.Part(details, "Filters.SearchBox"))
  skinSearchPreview(GW.Part(details, "Filters.SearchBox"))
  GW.SkinProgress(GW.Part(details, "Filters.SearchBox.SearchProgressBar"))
end

-- The window's header plate (its bronze ends and points border faded, the small shield kept) and its title line.
local function skinAchievementPlate(header)
  if type(header) ~= "table" or not header.GetRegions then return end
  T.FadeRegions(header, GW.KeepKeys(header, { "Shield" }))
  GW.SkinTitle(header.Title)
end

-- The achievements window's inside. The full search results are a window of their own (their rows stay the game's).
GW.INSIDES.AchievementFrame = function(frame)
  skinAchievementPlate(frame.Header)
  skinAchievementArea(frame.Categories)
  eachNamed(GW.ACH_AREAS, skinAchievementArea)
  GW.FadeArt(_G.AchievementFrameStatsBG)
  for _, name in ipairs(GW.ACH_HEADS) do skinSummaryHead(name) end
  skinSummaryBars()
  skinAchievementHeader(frame.HeaderDetails)
  watchAchievementRows(frame)
  if type(frame.SearchResults) == "table" and frame.SearchResults.GetRegions then GW.Skin(frame.SearchResults) end
end

-- Readable text ------------------------------------------------------------------------------

-- Colors each named font string this client has with a theme color.
local function paintNamed(names, token)
  for _, name in ipairs(names) do
    local fs = _G[name]
    if type(fs) == "table" and fs.SetTextColor then T.Color(fs, token) end
  end
end
GW.PaintNamed = paintNamed

-- Whether a region sits in a window Vanguard dressed (its dark panel behind it), whichever group dressed it: the
-- quest texts move between the quest window (Game windows group) and the map's quest panel (World map group).
local function inDressedWindow(region)
  local f = region:GetParent()
  while f and not vgWindow[f] do f = f:GetParent() end
  return f ~= nil
end

-- The quest texts' light colours, each only where its window has the dark panel (left as the game colours them on
-- its parchment).
local function lightDressed(names)
  for _, name in ipairs(names) do
    local fs = _G[name]
    if type(fs) == "table" and fs.SetTextColor and inDressedWindow(fs) then T.Color(fs, "text") end
  end
end

-- The quest window's texts in light body text and light headings (the quest's name included).
function GW.LightQuestText()
  lightDressed(GW.QUEST_BODY)
  lightDressed(GW.QUEST_HEADS)
end

-- The gossip window's list of lines (greeting and options), or nil on a client without it.
local function gossipBox()
  local panel = type(_G.GossipFrame) == "table" and _G.GossipFrame.GreetingPanel
  return type(panel) == "table" and panel.ScrollBox or nil
end

-- One gossip line (the greeting, or an option button's label) in light text.
local function lightGossipLine(line)
  if type(line.GreetingText) == "table" then T.Color(line.GreetingText, "text") end
  local fs = line.GetFontString and line:GetFontString()
  if fs then T.Color(fs, "text") end
end

-- Every line the gossip window shows, in light text.
function GW.LightGossip()
  local box = gossipBox()
  if type(box) == "table" and box.ForEachFrame then box:ForEachFrame(lightGossipLine) end
end

-- A book or letter page in light text (headings too), its parchment faded
-- (the game sets the page's colors as each page loads, so this runs after it).
function GW.LightItemText()
  for _, name in ipairs(GW.ITEM_TEXT_ART) do
    if type(_G[name]) == "table" and _G[name].SetAlpha then _G[name]:SetAlpha(0) end
  end
  local page = _G.ItemTextPageText
  if type(page) ~= "table" or type(page.SetTextColor) ~= "function" then return end
  for tag, token in pairs(GW.ITEM_TEXT_TAGS) do page:SetTextColor(tag, T.RGB(token)) end
end

-- Runs fn after a game function (by name, or a frame's method) each time it runs, if it exists.
local function after(owner, name, fn)
  local target = owner or _G
  if type(hooksecurefunc) ~= "function" or type(target[name]) ~= "function" then return end
  if owner then return hooksecurefunc(owner, name, ns.Guard("hook " .. tostring(name), fn)) end
  hooksecurefunc(name, ns.Guard("hook " .. tostring(name), fn))
end

-- Keeps quest and gossip text readable: the game recolors it for parchment as
-- each page shows, so Vanguard's colors go on after it does, every time.
local function keepTextReadable()
  after(nil, "QuestFrame_SetTextColor", function(fs) T.Color(fs, "text") end)
  after(nil, "QuestFrame_SetTitleTextColor", function(fs) T.Color(fs, "text") end)
  local box = gossipBox()
  if type(box) == "table" then after(box, "Update", GW.LightGossip) end
  for _, f in ipairs({ _G.QuestFrame, _G.GossipFrame }) do
    GW.HookScriptOnce(f, "OnShow", "quest text", function() GW.LightQuestText() GW.LightGossip() end)
  end
  GW.HookScriptOnce(_G.ItemTextFrame, "OnEvent", "item text", function(...) GW.LightItemText(...) end)
end

-- Keeps the shared quest texts readable after each QuestInfo_Display, in whichever dressed window shows them.
local function keepQuestInfoReadable()
  after(nil, "QuestInfo_Display", GW.LightQuestText)
end

-- The auction house's own panels --------------------------------------------------------------
-- The game's Buy, Sell and Auctions pages (Blizzard_AuctionHouseUI). Vanguard's Auction Helper page sits over the
-- window on its own two tabs, but these pages show on the game's tabs whether or not it is on, so they are dressed
-- either way. The wow token page is left as the game draws it.

-- Per-frame state kept off the game's frames: the category rows whose leave hook is in.
local vgAuctionRow = ns.FrameState("vgAuctionRow")

-- Parts of the window by dotted path: the result lists (each with sort buttons, lines and a refresh frame), the sell
-- and buy forms (laid out as labelled rows), the item headers, the push buttons, the bid boxes and the Auctions and
-- Bids sub tabs.
GW.AH_LISTS = {
  "BrowseResultsFrame.ItemList", "ItemSellList", "CommoditiesSellList", "CommoditiesBuyFrame.ItemList", "ItemBuyFrame.ItemList",
  "AuctionsFrame.AllAuctionsList", "AuctionsFrame.BidsList", "AuctionsFrame.ItemList", "AuctionsFrame.CommoditiesList",
}
GW.AH_FORMS = { "ItemSellFrame", "CommoditiesSellFrame", "CommoditiesBuyFrame.BuyDisplay" }
GW.AH_DISPLAYS = { "ItemBuyFrame.ItemDisplay", "AuctionsFrame.ItemDisplay" }
GW.AH_BUTTONS = {
  "ItemBuyFrame.BackButton", "ItemBuyFrame.BuyoutFrame.BuyoutButton", "ItemBuyFrame.BidFrame.BidButton", "CommoditiesBuyFrame.BackButton",
  "AuctionsFrame.CancelAuctionButton", "AuctionsFrame.BuyoutFrame.BuyoutButton", "AuctionsFrame.BidFrame.BidButton",
}
GW.AH_BID_BOXES = { "ItemBuyFrame.BidFrame.BidAmount", "AuctionsFrame.BidFrame.BidAmount" }
GW.AH_TABS = { "AuctionsFrame.AuctionsTab", "AuctionsFrame.BidsTab" }
-- A form's labelled rows (AuctionHouseSellFrameAlignedControlTemplate) and push buttons, by key; the buy dialog's buttons.
GW.AH_ROWS = { "QuantityInput", "PriceInput", "SecondaryPriceInput", "Duration", "Deposit", "TotalPrice", "UnitPrice" }
GW.AH_FORM_BUTTONS = { "PostButton", "BuyButton" }
GW.AH_DIALOG_BUTTONS = { "BuyNowButton", "CancelButton", "OkayButton" }

-- A row's lit look following the highlight the game shows on its selected line (SelectedHighlight): now, and each time
-- the game shows or hides it (a list sets it as it lays its lines out). The game also sets the highlight's alpha after
-- showing it (its list's highlight callback), so the faded highlight is faded again whenever that alpha is not 0.
local function followSelected(row)
  local mark = row.SelectedHighlight
  GW.FollowMark(row, mark)
  for _, name in ipairs({ "SetShown", "Show", "Hide" }) do
    GW.HookAfter(mark, name, function() GW.FollowMark(row, mark) end)
  end
  GW.HookAfter(mark, "SetAlpha", function(m, alpha) if alpha ~= 0 then m:SetAlpha(0) end end)
end

-- One result line (AuctionHouseItemListLineTemplate) or summary line as a selectable theme row: the stripe and the
-- game's hover and selected art faded, the summary's icon kept, its name in the text colour.
local function skinListLine(row)
  if type(row) ~= "table" then return end
  GW.DressRow(row, { "Icon" })
  GW.SkinText(row.Text, "label", "text")
  followSelected(row)
end

-- The sort buttons of a list's header row (the table builder makes them as the list lays out): theme buttons that keep
-- their sort arrow.
local function skinHeaders(list)
  local row = list.HeaderContainer
  if type(row) ~= "table" or not row.GetChildren then return end
  for _, header in ipairs({ row:GetChildren() }) do GW.SkinDropdown(header) end
end

-- A result list (AuctionHouseItemListTemplate): its dark tile and bronze frame faded for an inset, its empty-state,
-- searching and count texts in the theme, the refresh button on its tile, its lines as theme rows and its header
-- buttons, again whenever the game lays the columns out.
local function skinItemList(list)
  if type(list) ~= "table" or not list.GetRegions then return end
  GW.InsetPanel(list)
  GW.SkinText(list.ResultsText, "label", "text")
  GW.SkinText(GW.Part(list, "LoadingSpinner.SearchingText"), "heading", "text")
  GW.SkinText(GW.Part(list, "RefreshFrame.TotalQuantity"), "small", "text2")
  GW.SkinIconDropdown(GW.Part(list, "RefreshFrame.RefreshButton"))
  GW.WatchRows(list.ScrollBox, skinListLine)
  skinHeaders(list)
  GW.HookAfter(list, "UpdateTableBuilderLayout", skinHeaders)
end

-- The summary list's lines (Auctions and Bids): the same rows, over a dark tile.
local function skinSummaryList(list)
  if type(list) ~= "table" or not list.GetRegions then return end
  GW.InsetPanel(list)
  GW.WatchRows(list.ScrollBox, skinListLine)
end

-- A category row's text in the text colour (the game paints a category gold, and puts it back when the mouse leaves).
local function lightCategory(button)
  if type(button.Text) == "table" and button.Text.SetTextColor then T.Color(button.Text, "text") end
end

-- One category row (AuctionCategoryButtonTemplate) as a selectable theme row: its art faded, the lit look following
-- the game's SelectedTexture, its text light now and when the mouse leaves. The game sets a row up again as the
-- selection changes (AuctionHouseFilterButton_SetUp), which puts its art and text back.
local function skinCategoryButton(button)
  if type(button) ~= "table" or type(button.HookScript) ~= "function" then return end
  GW.DressRow(button)
  GW.FollowMark(button, button.SelectedTexture)
  lightCategory(button)
  if vgAuctionRow[button] then return end
  vgAuctionRow[button] = true
  button:HookScript("OnLeave", ns.Guard("category leave", lightCategory))
end

-- Whether the category set-up hook is in (it is a global, hooked once).
local categoriesHooked = false

-- The category list (AuctionHouseCategoriesListTemplate): the dark tile an inset, its rows as the list acquires them
-- and as the game sets each up.
local function skinCategories(list)
  if type(list) ~= "table" or not list.GetRegions then return end
  GW.InsetPanel(list)
  GW.WatchRows(list.ScrollBox, skinCategoryButton)
  if categoriesHooked or type(_G.AuctionHouseFilterButton_SetUp) ~= "function" then return end
  categoriesHooked = true
  hooksecurefunc("AuctionHouseFilterButton_SetUp", ns.Guard("hook filter set-up", skinCategoryButton))
end

-- The search bar (AuctionHouseSearchBarTemplate): the search box with its magnifier, the Search button, the filter
-- dropdown (its red clear cross is a button of its own, left alone) and the favourites button, a square button that
-- keeps its star.
local function skinSearchBar(bar)
  if type(bar) ~= "table" then return end
  GW.SkinSearch(bar.SearchBox)
  GW.SkinButton(bar.SearchButton)
  GW.SkinDropdown(bar.FilterButton)
  GW.AlignBeside(bar.FilterButton, bar.SearchButton)
  GW.CenterLabel(bar.FilterButton)
  GW.SkinIconDropdown(bar.FavoritesSearchButton)
end

-- The money line at the window's foot: the well behind it an inset, the gold-edged plate faded, the line centred in the well
-- and in the theme font.
local function skinMoneyBar(frame)
  GW.InsetPanel(frame.MoneyFrameInset)
  GW.FadeArt(frame.MoneyFrameBorder)
  GW.PadMoneyLine(frame.MoneyFrameBorder, frame.MoneyFrameInset, frame.CategoriesList)
  GW.SkinMoneyDisplay(GW.Part(frame, "MoneyFrameBorder.MoneyFrame"))
end

-- One labelled row of a form: its label in the text colour (gold in the game) and whichever control it holds: a number
-- box with its Max button, a large money input, the duration dropdown or a money display.
local function skinFormRow(row)
  if type(row) ~= "table" then return end
  GW.SkinText(row.Label, "label", "text")
  GW.SkinText(row.LabelTitle, "label", "text")
  GW.SkinEditBox(row.InputBox)
  GW.SkinButton(row.MaxButton)
  GW.SkinMoneyInput(row.MoneyInputFrame, GW.LARGE_MONEY_INPUTS, "Icon")
  GW.SkinDropdownChevron(row.Dropdown)
  GW.SkinMoneyDisplay(row.MoneyDisplayFrame)
end

-- A sell form or the commodities buy display (a tile with a header plate, an item display, labelled rows and a push
-- button): the tile an inset, the plate faded and its label a section head, the rows, the button, the buyout check
-- box with its label, and the item display on an inset.
local function skinAuctionForm(form)
  if type(form) ~= "table" or not form.GetRegions then return end
  ns.Try("auction house form tile", GW.InsetPanel, form)
  ns.Try("auction house form head", GW.SkinSection, form.CreateAuctionLabel)
  for _, key in ipairs(GW.AH_ROWS) do ns.Try("auction house row " .. key, skinFormRow, form[key]) end
  GW.EachKey(form, GW.AH_FORM_BUTTONS, GW.SkinButton)
  GW.SkinCheck(form.BuyoutModeCheckButton)
  GW.SkinText(GW.Part(form, "BuyoutModeCheckButton.Text"), "label", "text")
  GW.InsetPanel(form.ItemDisplay)
end

-- An Auctions or Bids sub tab (AuctionHouseAuctionsFrameTabTemplate) as a theme tab; anything that is not a frame is skipped.
local function skinSubTab(tab)
  if type(tab) == "table" and tab.CreateTexture then T.Tab(tab) end
end

-- The confirm-purchase dialog: its dark border faded, a flat panel with a shadow, its three buttons and price line.
local function skinBuyDialog(dialog)
  if type(dialog) ~= "table" or not dialog.GetRegions then return end
  GW.FadeFrame(dialog.Border)
  T.Panel(dialog, { shadow = true, alpha = T.ALPHA.dialog })
  GW.EachKey(dialog, GW.AH_DIALOG_BUTTONS, GW.SkinButton)
  GW.SkinMoneyDisplay(dialog.PriceFrame)
end

-- Runs fn on the part of frame at each dotted path, each under ns.Try named for the path: a part that fails (a
-- list laid out differently in this client) is reported by name and leaves every other part dressed.
local function tryParts(frame, paths, fn)
  for _, path in ipairs(paths) do ns.Try("auction house " .. path, fn, GW.Part(frame, path)) end
end

-- The window's browsing side: the money line, the search bar, the categories, every list and the summary list.
local function skinAuctionBrowse(frame)
  ns.Try("auction house money", skinMoneyBar, frame)
  ns.Try("auction house search", skinSearchBar, frame.SearchBar)
  ns.Try("auction house categories", skinCategories, frame.CategoriesList)
  tryParts(frame, GW.AH_LISTS, skinItemList)
  tryParts(frame, { "AuctionsFrame.SummaryList" }, skinSummaryList)
end

-- The window's forms and buttons: the sell and buy forms, the item headers, the push buttons, the bid boxes, the sub
-- tabs and the buy dialog.
local function skinAuctionForms(frame)
  tryParts(frame, GW.AH_FORMS, skinAuctionForm)
  tryParts(frame, GW.AH_DISPLAYS, GW.InsetPanel)
  tryParts(frame, GW.AH_BUTTONS, GW.SkinButton)
  tryParts(frame, GW.AH_BID_BOXES, GW.SkinMoneyInput)
  tryParts(frame, GW.AH_TABS, skinSubTab)
  ns.Try("auction house buy dialog", skinBuyDialog, frame.BuyDialog)
end

-- The auction house window's insides (its main tabs are dressed with the tab row, GW.DressTabsOf).
GW.INSIDES.AuctionHouseFrame = function(frame)
  skinAuctionBrowse(frame)
  skinAuctionForms(frame)
end

-- Hooking -------------------------------------------------------------------------------------

-- Whether Vanguard's quest dialog is on in place of this game window (QuestDialog loads before this module).
local function replaced(name)
  local dialog = ns.GetModule("QuestDialog")
  return GW.QUEST_WINDOWS[name] == true and dialog ~= nil and dialog.frame ~= nil
end

-- Whether a registered window should be hooked now: the client has it, its group is
-- switched on, it isn't hooked yet, and the quest dialog doesn't stand in for it.
local function wanted(name, frame)
  local entry = GW.REGISTERED[name]
  if not entry or not GW.settings or not GW.settings[entry.group] then return false end
  return type(frame) == "table" and frame.HookScript ~= nil and not vgWindow[frame] and not replaced(name)
end

-- Skins a registered window now and every time it shows (once hooked). A skin that fails
-- is reported under the window's name and stops neither its OnShow hook nor the other windows.
local function watch(name)
  local frame = _G[name]
  if not wanted(name, frame) then return end
  local skin = GW.REGISTERED[name].skin
  -- Runs the window's skin under ns.Try.
  local function run(f) ns.Try("window " .. name, skin, f) end
  vgWindow[frame] = true
  run(frame)
  frame:HookScript("OnShow", run)
end

-- Watches every window in a list.
local function watchAll(names)
  for _, name in ipairs(names) do watch(name) end
end

-- A part of the game loaded: watch its windows.
local function onLoaded(_, addon)
  watchAll(GW.ON_DEMAND[addon] or {})
end

-- Records windows under a group with their skin (GW.Skin by default), watched at
-- once when the module is already on (a late registration).
local function record(group, names, skin)
  for _, name in ipairs(names) do
    if not GW.REGISTERED[name] then GW.ORDER[#GW.ORDER + 1] = name end
    GW.REGISTERED[name] = { group = group, skin = skin or GW.Skin }
  end
  if GW.settings then watchAll(names) end
end

-- Registers game windows under a group (docs/design/RESKIN.md 3.1), at file scope:
--   GW.Add(group, "framed", names, skin)            skinned now and on every show
--   GW.Add(group, "popups", names, skin)            the same, for popups
--   GW.Add(group, "onDemand", addon, names, skin)   once that part of the game loads
-- skin is a function(frame), GW.Skin when nil.
function GW.Add(group, kind, a, b, c)
  if kind ~= "onDemand" then return record(group, a, b) end
  GW.ON_DEMAND[a] = GW.ON_DEMAND[a] or {}
  for _, name in ipairs(b) do table.insert(GW.ON_DEMAND[a], name) end
  record(group, b, c)
end

-- Push buttons a window keeps outside Button1-4, themed with it.
function GW.AddButtons(name, buttonNames)
  GW.EXTRA_BUTTONS[name] = GW.EXTRA_BUTTONS[name] or {}
  for _, b in ipairs(buttonNames) do table.insert(GW.EXTRA_BUTTONS[name], b) end
end

-- Durability on the character pane ----------------------------------------------------------

-- A gear slot's durability label (made once), along the slot's bottom edge.
local function slotLabel(button)
  if not vgDurability[button] then
    vgDurability[button] = T.Text(button:CreateFontString(nil, "OVERLAY"), "auraCount", false)
    vgDurability[button]:SetPoint("BOTTOM", button, "BOTTOM", 0, 2)
  end
  return vgDurability[button]
end

-- One slot's durability as "62%" in the info strip's colors; hidden at full,
-- for items without durability, or when the client hides it.
function GW.PaintDurability(button)
  local label, cur, max = slotLabel(button), GetInventoryItemDurability(button:GetID())
  cur, max = ns.PlainNumber(cur), ns.PlainNumber(max)
  local percent = cur and max and max > 0 and math.floor(cur * 100 / max)
  label:SetShown(percent and percent < 100 or false)
  if not percent or percent >= 100 then return end
  label:SetText(percent .. "%")
  T.Color(label, ns.GetModule("InfoStrip").DurabilityColor(percent))
end

-- Every gear slot on the character pane, while it's open.
function GW.PaintAllDurability()
  if not (_G.CharacterFrame and _G.CharacterFrame:IsShown()) then return end
  for _, slot in ipairs(GW.SLOTS) do
    local b = _G["Character" .. slot .. "Slot"]
    if type(b) == "table" and b.GetID then GW.PaintDurability(b) end
  end
end

-- Durability on the gear slots: when the pane opens, and as gear wears or changes.
local function watchDurability()
  local pane = _G.CharacterFrame
  if type(pane) ~= "table" or type(GetInventoryItemDurability) ~= "function" then return end
  GW.HookScriptOnce(pane, "OnShow", "durability", function() GW.PaintAllDurability() end)
  for _, e in ipairs({ "UPDATE_INVENTORY_DURABILITY", "UNIT_INVENTORY_CHANGED" }) do ns.On(e, GW.PaintAllDurability) end
end

-- The windows this file skins itself: framed windows, popups, the breath bars' container and the
-- windows that load later. Other groups register from Modules/Windows<Area>.lua.
GW.Add("windows", "framed", GW.FRAMED, GW.SkinFramed)
GW.Add("windows", "framed", { "LootFrame" }, GW.SkinLoot)
GW.Add("popups", "popups", GW.POPUPS, GW.SkinFramed)
GW.Add("timers", "framed", GW.TIMERS, GW.SkinTimerContainer)
for addon, names in pairs(GW.LATER) do GW.Add("windows", "onDemand", addon, names, GW.SkinFramed) end

-- Module entry point (Core/Modules.lua): every registered window whose group is on is
-- watched (those loaded now and later), plus the game menu, readable text, durability
-- and dragging windows by their title bar.
function GW.Enable(settings)
  GW.settings = settings
  ns.On("ADDON_LOADED", onLoaded)
  watchAll(GW.ORDER)
  if settings.windows then watchGameMenu() keepTextReadable() end
  if settings.windows or settings.map then keepQuestInfoReadable() end
  if settings.durability then watchDurability() end
  if settings.movable then GW.WatchMoves() end
end
