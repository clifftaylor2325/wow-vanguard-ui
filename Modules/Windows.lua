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

-- Module entry point (Core/Modules.lua): watch each switched-on group of windows.
function GW.Enable(settings)
  if settings.windows then
    watchAll(GW.FRAMED, GW.Skin)
    for _, names in pairs(GW.ON_DEMAND) do watchAll(names, GW.Skin) end
    ns.On("ADDON_LOADED", onLoaded)
  end
  if settings.popups then watchAll(GW.POPUPS, GW.Skin) end
  if settings.timers then watchAll(GW.TIMERS, GW.SkinTimer) end
end
