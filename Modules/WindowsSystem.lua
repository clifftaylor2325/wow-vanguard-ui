-- Game windows, system group: Game options, addon list, chat config, Edit Mode windows, keybinding, Cooldown Manager settings, help, colour picker, death recap, in the
-- Vanguard look. Filled by stream S3 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.
-- Each window keeps its own layout and buttons: art faded by alpha, a flat panel behind it,
-- its buttons, edit boxes, tabs and headings themed. Every part is optional (a client may lack it).

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- Helpers -------------------------------------------------------------------------------------

-- A part of a frame by parentKey path ("Container.SettingsList"), or nil when the client lacks any step of it.
local function part(frame, path)
  local found = frame
  for key in path:gmatch("[^.]+") do
    if type(found) ~= "table" then return nil end
    found = found[key]
  end
  return type(found) == "table" and found or nil
end

-- Fades a part's own textures (its text and children stay), or the texture itself.
local function fadeRegions(p)
  if p.GetRegions then T.FadeRegions(p) elseif p.SetAlpha then p:SetAlpha(0) end
end

-- Fades a part completely (alpha 0): a border or background frame with no text of its own.
local function fadeAll(p)
  if p.SetAlpha then p:SetAlpha(0) end
end

-- A heading font string in the theme font, gold.
local function heading(p)
  if p.SetFont then T.Text(p, "heading", "gold") end
end

-- A game tab's selected state: the accent line follows the game's SelectableButton calls.
local function tabSelected(tab, selected)
  tab.vgChecked = selected == true
  T.Tab(tab)
end

-- A panel tab (MinimalTabTemplate) in the theme; its selection comes through OnSelected.
local function skinTab(tab)
  T.Tab(tab)
  if tab.vgTabWatched or type(tab.OnSelected) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  tab.vgTabWatched = true
  hooksecurefunc(tab, "OnSelected", tabSelected)
end

-- An inset panel behind a list or canvas.
local function inset(p)
  T.Panel(p, { inset = true })
end

-- Shows a part again: art the window's fade took that is really content (a tutorial's pictures).
local function restore(p)
  if p.SetAlpha then p:SetAlpha(1) end
end

-- What a skin spec can list, in order: the parts (parentKey paths) each step is applied to.
local STEPS = {
  { "art", fadeAll }, { "fade", fadeRegions }, { "close", T.CloseButton }, { "buttons", T.Button },
  { "edits", T.EditBox }, { "tabs", skinTab }, { "insets", inset }, { "titles", heading }, { "keep", restore },
}

-- Applies each listed step of a spec to the parts of the frame that exist.
local function dress(frame, spec)
  for _, step in ipairs(STEPS) do
    for _, path in ipairs(spec[step[1]] or {}) do
      local p = part(frame, path)
      if p then step[2](p) end
    end
  end
end

-- Builds a skin from a spec: the frame's own textures faded, a flat panel with a shadow
-- (unless spec.panel is false), then the spec's parts dressed. Runs again on every show.
local function skinner(spec)
  return function(frame)
    T.FadeRegions(frame)
    if spec.panel ~= false then T.Panel(frame, { shadow = true }) end
    dress(frame, spec)
  end
end

-- Game options -------------------------------------------------------------------------------

-- The options window's parts: SettingsFrameTemplate (NineSlice keeps its title text, Bg is the
-- flat backdrop), two MinimalTabTemplate tabs, the category list, the settings list and canvas.
GW.SETTINGS_SPEC = {
  art = { "Bg" }, fade = { "NineSlice" }, close = { "ClosePanelButton" },
  buttons = { "ApplyButton", "CloseButton" }, edits = { "SearchBox" }, tabs = { "GameTab", "AddOnsTab" },
  insets = { "CategoryList", "Container.SettingsList" }, titles = { "NineSlice.Text" },
}
-- Skins the game's options window. (Blizzard_Settings_Shared has no named settings font objects on
-- Forever, so no fonts are set; the pages in Container/SettingsCanvas stay the game's.)
GW.SkinSettings = skinner(GW.SETTINGS_SPEC)

GW.Add("system", "framed", { "SettingsPanel" }, GW.SkinSettings)

-- Addon list, chat config, nameplates tutorial -----------------------------------------------

-- A skin for a window GW.Skin handles (art faded, panel, close button, title) with more parts dressed.
local function withWindowSkin(spec)
  return function(frame)
    GW.Skin(frame)
    dress(frame, spec)
  end
end

-- The addon list: its push buttons and search box (the rows keep the game's look).
GW.SkinAddonList = withWindowSkin({
  buttons = { "CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton" }, edits = { "SearchBox" },
})
-- The nameplates tutorial: the window skin, but its four picture cards are the content, so they stay.
GW.SkinNamePlatesTutorial = withWindowSkin({ keep = { "StyleOptions", "Aggro", "BuffsDebuffs", "EnemyVsFriendly" } })

-- Whether a child of the chat settings window is one of its boxes: it has the game's NineSlice
-- (ChatConfigBoxTemplate), or its name ends in Backdrop or Background.
local function isChatBox(child)
  local name = child.GetName and child:GetName() or ""
  return type(child.NineSlice) == "table" or name:find("Backdrop$") ~= nil or name:find("Background$") ~= nil
end

-- One box of the chat settings in the theme: its border art faded, an inset panel behind it.
local function skinChatBox(box)
  if type(box.NineSlice) == "table" then fadeRegions(box.NineSlice) end
  fadeRegions(box)
  inset(box)
end

-- The chat settings window: the window skin, its header plate faded with the title kept, and
-- each box directly under it (the category list and the settings area) an inset panel.
function GW.SkinChatConfig(frame)
  GW.Skin(frame)
  dress(frame, { fade = { "Header" }, titles = { "Header.Text" } })
  for _, child in ipairs({ frame:GetChildren() }) do
    if isChatBox(child) then skinChatBox(child) end
  end
end
GW.AddButtons("ChatConfigFrame", {
  "ChatConfigFrameDefaultButton", "ChatConfigFrameCancelButton", "ChatConfigFrameOkayButton",
  "CombatLogDefaultButton", "TextToSpeechDefaultButton",
})

GW.Add("system", "framed", { "AddonList" }, GW.SkinAddonList)
GW.Add("system", "framed", { "ChatConfigFrame" }, GW.SkinChatConfig)
GW.Add("system", "framed", { "NamePlatesTutorial" }, GW.SkinNamePlatesTutorial)
