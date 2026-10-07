-- The game's own windows in the Vanguard look: character, merchant, mail,
-- quest, gossip, trade, loot and roll windows, friends, the dressing room,
-- the flight map, books and letters, the game menu, the ready check, popups,
-- the windows that load later (spellbook, auction house, professions,
-- inspect, guild bank, collections, achievements, dungeon journal) and the
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

local T = ns.Theme

local GW = ns.Module("Windows", { defaults = {
  windows = true, popups = true, timers = true, durability = true,
  social = true, town = true, system = true, map = true, menus = true, tabs = true, pvp = true,
} })

-- The groups of game windows, each a switch under Bars, map, chat -> Game windows.
GW.GROUPS = { "windows", "popups", "timers", "social", "town", "system", "map", "menus", "tabs", "pvp" }
-- Every registered window: name -> { group = , skin = }, and the names in the order registered.
GW.REGISTERED, GW.ORDER = {}, {}

-- Framed windows (most use the game's ButtonFrameTemplate or PortraitFrameTemplate).
GW.FRAMED = {
  "CharacterFrame", "MerchantFrame", "MailFrame", "QuestFrame", "GossipFrame", "TradeFrame",
  "LootFrame", "GameMenuFrame", "ReadyCheckFrame", "FriendsFrame", "DressUpFrame", "TaxiFrame", "ItemTextFrame",
  "GroupLootFrame1", "GroupLootFrame2", "GroupLootFrame3", "GroupLootFrame4",
}
GW.POPUPS = { "StaticPopup1", "StaticPopup2", "StaticPopup3", "StaticPopup4" }
GW.TIMERS = { "MirrorTimer1", "MirrorTimer2", "MirrorTimer3" }
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
GW.ITEM_TEXT_TAGS = { P = "text", H1 = "gold", H2 = "gold", H3 = "gold" }
-- Quest window texts the game colors for its parchment (dark brown, unreadable
-- on the dark panel): body text goes light, headings gold.
GW.QUEST_BODY = { "QuestInfoDescriptionText", "QuestInfoObjectivesText", "QuestInfoRewardText", "QuestProgressText", "GreetingText" }
GW.QUEST_HEADS = { "QuestInfoTitleHeader", "QuestInfoDescriptionHeader", "QuestInfoObjectivesHeader", "QuestProgressTitleText", "CurrentQuestsText", "AvailableQuestsText" }
-- Push buttons a window keeps outside its button row (the mail's Open All).
GW.EXTRA_BUTTONS = { MailFrame = { "OpenAllMail" } }
-- The character pane's gear slots (Character<slot>Slot; each button's ID is its inventory slot).
GW.SLOTS = { "Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", "Hands", "Waist", "Legs", "Feet",
  "Finger0", "Finger1", "Trinket0", "Trinket1", "MainHand", "SecondaryHand", "Ranged" }
-- The game menu's header plate: the three textures behind its title.
GW.MENU_PLATE = { "LeftBG", "RightBG", "CenterBG" }
-- A window's art pieces that are faded out, where it has them.
GW.ART = { "NineSlice", "Bg", "TopTileStreaks", "PortraitContainer", "Border", "Inset" }
-- Art that is a window's content, not its frame, by window: faded with the rest, then shown again.
-- The flight map draws its map on a texture of its own (SetTaxiMap: the TaxiMap texture, InsetBg on newer builds).
GW.CONTENT_ART = { TaxiFrame = { "TaxiMap", "InsetBg" } }
-- How far a window's panel reaches out past the window (units): the game's thick border art sat in
-- that room; it is the contents' margin to the panel's edge on every side (art that fills the window
-- edge to edge, like the spellbook's pages, included), and keeps the close button 12 in from the window.
GW.PAD = 12

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
  if part.vgCorner ~= nil then return part.vgCorner end
  local point, rel, relPoint = part:GetPoint(1)
  if point == nil then return false end
  part.vgCorner = rel == frame and point == "TOPRIGHT" and relPoint == "TOPRIGHT"
  return part.vgCorner
end

-- Puts a window's corner close button where every window has it (T.PlaceClose: T.CONTROL.inset in
-- from the panel's top-right corner) and its maximize/minimize box T.CONTROL.step left of it (the game
-- placed them for its wider art). A close button the game put anywhere else stays there.
function GW.PlaceControls(frame, close)
  if not atCorner(close, frame) then return end
  T.PlaceClose(close, frame)
  for _, key in ipairs(GW.MAX_MIN) do
    local box = frame[key]
    if type(box) == "table" and box.SetPoint then box:ClearAllPoints() box:SetPoint("CENTER", close, "CENTER", -T.CONTROL.step, 0) end
  end
end

-- A window's close button (when it has one) in the theme and in its corner (GW.PlaceControls).
function GW.DressClose(frame, close)
  if type(close) ~= "table" or not close.CreateTexture then return end
  T.CloseButton(close)
  if close.GetPoint then GW.PlaceControls(frame, close) end
end

-- The close, maximize and minimize buttons, title and push buttons in the theme.
local function dressParts(frame, name)
  GW.DressClose(frame, frame.CloseButton or (name and _G[name .. "CloseButton"]))
  GW.DressMaxMin(frame)
  local title = (type(frame.TitleContainer) == "table" and frame.TitleContainer.TitleText) or frame.TitleText
  if type(title) == "table" and title.SetFont then T.Text(title, "heading", false) end
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

-- Skins one window: art faded (its content art kept), a flat panel with a soft shadow `pad` units
-- (default GW.PAD) out past it, its parts themed.
function GW.Skin(frame, pad)
  local name = frame.GetName and frame:GetName()
  fadeArt(frame)
  keepContent(frame, name)
  T.Panel(frame, { shadow = true, pad = pad or GW.PAD })
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

-- A skin function for windows with more art than GW.ART: GW.Skin, then the parts
-- named in keys faded (see GW.FadeParts).
function GW.SkinWith(keys)
  return function(frame)
    GW.Skin(frame)
    GW.FadeParts(frame, keys)
  end
end

-- A breath or fatigue bar: the window skin hugging the bar (no room around it), and its bar in the theme's bar texture.
function GW.SkinTimer(frame)
  GW.Skin(frame, 0)
  local bar = frame.StatusBar or _G[(frame:GetName() or "") .. "StatusBar"]
  if type(bar) == "table" and bar.SetStatusBarTexture then T.StyleBar(bar) end
end

-- Newer clients (WoW Forever) keep the breath and fatigue bars in one container
-- instead of MirrorTimer1-3: skins every timer frame it holds.
local function skinContainerTimers()
  for _, child in ipairs({ _G.MirrorTimerContainer:GetChildren() }) do
    if type(child) == "table" and type(child.StatusBar) == "table" then GW.SkinTimer(child) end
  end
end

-- Watches MirrorTimerContainer, where the client has it: its timers now, and
-- again each time it sets one up (it makes them as they're needed).
local function watchContainer()
  local box = _G.MirrorTimerContainer
  if type(box) ~= "table" or not box.GetChildren or box.vgWindow then return end
  box.vgWindow = true
  skinContainerTimers()
  if type(box.SetupTimer) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(box, "SetupTimer", skinContainerTimers) end
end

-- The game menu -------------------------------------------------------------------------------

-- One game menu button in the theme, once: the menu takes its buttons from a
-- pool (made again on every InitButtons, reused ones keep the look), and
-- Vanguard's own button is made from the same template.
function GW.SkinMenuButton(button)
  if button.vgMenuSkinned then return end
  button.vgMenuSkinned = true
  T.Button(button)
end

-- The menu's header: the plate behind the title hidden, the title in the theme font, inside the panel.
local function dressMenuHeader(menu)
  local header = menu.Header
  if type(header) ~= "table" then return end
  for _, key in ipairs(GW.MENU_PLATE) do
    if type(header[key]) == "table" then header[key]:Hide() end
  end
  if type(header.Text) == "table" then T.Text(header.Text, "heading", false) end
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
  hooksecurefunc(menu, "InitButtons", GW.SkinMenu)
  GW.SkinMenu(menu)
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

-- The quest window's texts in light body text and gold headings.
function GW.LightQuestText()
  paintNamed(GW.QUEST_BODY, "text")
  paintNamed(GW.QUEST_HEADS, "gold")
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

-- A book or letter page in light text with gold headings, its parchment faded
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
  if owner then return hooksecurefunc(owner, name, fn) end
  hooksecurefunc(name, fn)
end

-- Keeps quest and gossip text readable: the game recolors it for parchment as
-- each page shows, so Vanguard's colors go on after it does, every time.
local function keepTextReadable()
  after(nil, "QuestFrame_SetTextColor", function(fs) T.Color(fs, "text") end)
  after(nil, "QuestFrame_SetTitleTextColor", function(fs) T.Color(fs, "gold") end)
  after(nil, "QuestInfo_Display", GW.LightQuestText)
  local box = gossipBox()
  if type(box) == "table" then after(box, "Update", GW.LightGossip) end
  for _, f in ipairs({ _G.QuestFrame, _G.GossipFrame }) do
    if type(f) == "table" and f.HookScript then f:HookScript("OnShow", function() GW.LightQuestText() GW.LightGossip() end) end
  end
  if type(_G.ItemTextFrame) == "table" and _G.ItemTextFrame.HookScript then _G.ItemTextFrame:HookScript("OnEvent", GW.LightItemText) end
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
  return type(frame) == "table" and frame.HookScript ~= nil and not frame.vgWindow and not replaced(name)
end

-- Skins a registered window now and every time it shows (once hooked). A skin that fails
-- is reported under the window's name and stops neither its OnShow hook nor the other windows.
local function watch(name)
  local frame = _G[name]
  if not wanted(name, frame) then return end
  local skin = GW.REGISTERED[name].skin
  -- Runs the window's skin under ns.Try.
  local function run(f) ns.Try("window " .. name, skin, f) end
  frame.vgWindow = true
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
  if not button.vgDurability then
    button.vgDurability = T.Text(button:CreateFontString(nil, "OVERLAY"), "auraCount", false)
    button.vgDurability:SetPoint("BOTTOM", button, "BOTTOM", 0, 2)
  end
  return button.vgDurability
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
  pane:HookScript("OnShow", GW.PaintAllDurability)
  for _, e in ipairs({ "UPDATE_INVENTORY_DURABILITY", "UNIT_INVENTORY_CHANGED" }) do ns.On(e, GW.PaintAllDurability) end
end

-- The windows this file skins itself: framed windows, popups, breath bars, and the
-- windows that load later. Other groups register from Modules/Windows<Area>.lua.
GW.Add("windows", "framed", GW.FRAMED)
GW.Add("popups", "popups", GW.POPUPS)
GW.Add("timers", "framed", GW.TIMERS, GW.SkinTimer)
for addon, names in pairs(GW.LATER) do GW.Add("windows", "onDemand", addon, names) end

-- Module entry point (Core/Modules.lua): every registered window whose group is on is
-- watched (those loaded now and later), plus the game menu, readable text, durability
-- and the breath bars' container.
function GW.Enable(settings)
  GW.settings = settings
  ns.On("ADDON_LOADED", onLoaded)
  watchAll(GW.ORDER)
  if settings.windows then watchGameMenu() keepTextReadable() end
  if settings.durability then watchDurability() end
  if settings.timers then watchContainer() end
end
