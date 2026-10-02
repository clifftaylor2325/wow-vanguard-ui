-- The game's own windows in the ForeverUI look: character, merchant, mail,
-- quest, gossip, trade, loot and roll windows, the game menu, the ready
-- check, popups, the spellbook (when it loads) and the breath and fatigue
-- bars. Each window keeps its own layout and buttons: its art is faded out
-- (alpha only) and a flat panel, the close button, title font and push
-- buttons are themed. It's done every time a window shows, so parts the game
-- adds later are covered too, and painting again never piles up.

local ADDON, ns = ...

local T = ns.Theme

local GW = ns.Module("Windows", { defaults = { windows = true, popups = true, timers = true } })

-- Framed windows (most use the game's ButtonFrameTemplate or PortraitFrameTemplate).
GW.FRAMED = {
  "CharacterFrame", "MerchantFrame", "MailFrame", "QuestFrame", "GossipFrame", "TradeFrame",
  "LootFrame", "GameMenuFrame", "ReadyCheckFrame",
  "GroupLootFrame1", "GroupLootFrame2", "GroupLootFrame3", "GroupLootFrame4",
}
GW.POPUPS = { "StaticPopup1", "StaticPopup2", "StaticPopup3", "StaticPopup4" }
GW.TIMERS = { "MirrorTimer1", "MirrorTimer2", "MirrorTimer3" }
-- Windows that load with their own part of the game: addon name -> window names.
GW.ON_DEMAND = { Blizzard_PlayerSpells = { "PlayerSpellsFrame" }, Blizzard_TimeManager = { "TimeManagerFrame" } }
-- Quest window texts the game colors for its parchment (dark brown, unreadable
-- on the dark panel): body text goes light, headings gold.
GW.QUEST_BODY = { "QuestInfoDescriptionText", "QuestInfoObjectivesText", "QuestInfoRewardText", "QuestProgressText", "GreetingText" }
GW.QUEST_HEADS = { "QuestInfoTitleHeader", "QuestInfoDescriptionHeader", "QuestInfoObjectivesHeader", "QuestProgressTitleText", "CurrentQuestsText", "AvailableQuestsText" }
-- A window's art pieces that are faded out, where it has them.
GW.ART = { "NineSlice", "Bg", "TopTileStreaks", "PortraitContainer", "Border", "Inset" }

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

-- The close button, title and push buttons in the theme.
local function dressParts(frame, name)
  local close = frame.CloseButton or (name and _G[name .. "CloseButton"])
  if type(close) == "table" then T.CloseButton(close) end
  local title = (type(frame.TitleContainer) == "table" and frame.TitleContainer.TitleText) or frame.TitleText
  if type(title) == "table" and title.SetFont then T.Text(title, "heading", false) end
  for _, b in ipairs(buttons(frame, name)) do T.Button(b) end
end

-- Skins one window: art faded, a flat panel with a soft shadow, its parts themed.
function GW.Skin(frame)
  local name = frame.GetName and frame:GetName()
  fadeArt(frame)
  T.Panel(frame, { shadow = true })
  dressParts(frame, name)
end

-- A breath or fatigue bar: the window skin, and its bar in the theme's bar texture.
function GW.SkinTimer(frame)
  GW.Skin(frame)
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
  if type(box) ~= "table" or not box.GetChildren or box.fuiWindow then return end
  box.fuiWindow = true
  skinContainerTimers()
  if type(box.SetupTimer) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(box, "SetupTimer", skinContainerTimers) end
end

-- Readable text ------------------------------------------------------------------------------

-- Colors each named font string this client has with a theme color.
local function paintNamed(names, token)
  for _, name in ipairs(names) do
    local fs = _G[name]
    if type(fs) == "table" and fs.SetTextColor then T.Color(fs, token) end
  end
end

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

-- Runs fn after a game function (by name, or a frame's method) each time it runs, if it exists.
local function after(owner, name, fn)
  local target = owner or _G
  if type(hooksecurefunc) ~= "function" or type(target[name]) ~= "function" then return end
  if owner then return hooksecurefunc(owner, name, fn) end
  hooksecurefunc(name, fn)
end

-- Keeps quest and gossip text readable: the game recolors it for parchment as
-- each page shows, so ForeverUI's colors go on after it does, every time.
local function keepTextReadable()
  after(nil, "QuestFrame_SetTextColor", function(fs) T.Color(fs, "text") end)
  after(nil, "QuestFrame_SetTitleTextColor", function(fs) T.Color(fs, "gold") end)
  after(nil, "QuestInfo_Display", GW.LightQuestText)
  local box = gossipBox()
  if type(box) == "table" then after(box, "Update", GW.LightGossip) end
  for _, f in ipairs({ _G.QuestFrame, _G.GossipFrame }) do
    if type(f) == "table" and f.HookScript then f:HookScript("OnShow", function() GW.LightQuestText() GW.LightGossip() end) end
  end
end

-- Hooking -------------------------------------------------------------------------------------

-- Skins a window now and every time it shows (once hooked).
local function watch(name, skin)
  local frame = _G[name]
  if type(frame) ~= "table" or not frame.HookScript or frame.fuiWindow then return end
  frame.fuiWindow = true
  skin(frame)
  frame:HookScript("OnShow", skin)
end

-- Watches every window in a list.
local function watchAll(names, skin)
  for _, name in ipairs(names) do watch(name, skin) end
end

-- A part of the game loaded: watch its windows.
local function onLoaded(_, addon)
  watchAll(GW.ON_DEMAND[addon] or {}, GW.Skin)
end

-- Watches the framed windows (those loaded now and later) and keeps their text readable.
local function watchWindows()
  watchAll(GW.FRAMED, GW.Skin)
  for _, names in pairs(GW.ON_DEMAND) do watchAll(names, GW.Skin) end
  ns.On("ADDON_LOADED", onLoaded)
  keepTextReadable()
end

-- Module entry point (Core/Modules.lua): watch each switched-on group of windows.
function GW.Enable(settings)
  if settings.windows then watchWindows() end
  if settings.popups then watchAll(GW.POPUPS, GW.Skin) end
  if settings.timers then
    watchAll(GW.TIMERS, GW.SkinTimer)
    watchContainer()
  end
end
