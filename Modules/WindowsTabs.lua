-- Game windows, tabs group: Tab buttons on every skinned window, the character pane's inner panels and the game's scroll bars, in the
-- Vanguard look. Filled by stream S7 of docs/handoff/RESKIN-PLAN.md.
--
-- This file registers no windows of its own: it dresses what the other groups registered. At
-- PLAYER_LOGIN it reads GW.ORDER, and when a part of the game loads (ADDON_LOADED) it reads that
-- part's GW.ON_DEMAND windows, so it keeps no list of other streams' windows. Its switch is
-- GW.settings.tabs; a window whose own group is switched off stays the game's, tabs and all.

local ADDON, ns = ...

local T = ns.Theme

local GW = ns.GetModule("Windows")

-- How many tabs a PanelTemplates window can have (they are named <window>Tab1 ... Tab8).
GW.MAX_TABS = 8
-- Where a window keeps a tab system (TabSystemTemplate, Blizzard_SharedXML/Shared/TabSystem), as a path of
-- parentKeys: the window's own, the spellbook's categories, the talents page, the friends window's header.
GW.TAB_SYSTEMS = {
  { "TabSystem" }, { "CategoryTabSystem" }, { "TabHeaders" }, { "FriendsTabHeader", "TabSystem" },
  { "SpellBookFrame", "CategoryTabSystem" }, { "TalentsFrame", "TabSystem" },
}
-- The windows with side tabs, dressed by name whether or not another group registered them: the
-- character pane, the guild window (Communities), the Legacy window, the inspect window and the group finder.
GW.TAB_WINDOWS = { "CharacterFrame", "CommunitiesFrame", "LegacySystemFrame", "InspectFrame", "LFGParentFrame" }
-- Where those windows keep their side tabs, as parentKeys on the window (the Camelot character pane
-- keeps its own in a ModeTabs frame, which has a Tabs array too). LargeSideTabButtonTemplate and
-- RightSideTabTemplate (the guild window's) tabs.
GW.SIDE_TABS = {
  "CharacterTab", "ReputationTab", "SkillsTab", "PvPTab", "CurrencyTab", "StatisticsTab",
  "ChatTab", "RosterTab", "GuildBenefitsTab", "GuildInfoTab", "GuildPreferredPlaySettingsTab",
  "LegacyTreeTab", "LegacyChallengeTab", "LegacyRewardTrackTab", "ListingTab", "BrowsingTab", "WhoListingTab",
}
-- The windows already dressed (a window is hooked once).
local dressed = setmetatable({}, { __mode = "k" })

-- The part reached from frame by a path of parentKeys, or nil when a step is missing.
local function walk(frame, path)
  local part = frame
  for _, key in ipairs(path) do
    if type(part) ~= "table" then return nil end
    part = part[key]
  end
  return type(part) == "table" and part or nil
end

-- Adds a tab button to the list, once (anything that takes a script hook is one).
local function add(list, button)
  if type(button) ~= "table" or not button.HookScript or list.seen[button] then return end
  list.seen[button] = true
  list[#list + 1] = button
end

-- Adds the buttons of a window's parentArray of tabs (Tabs: PanelTabButtonTemplate's).
local function addArray(list, tabs)
  if type(tabs) ~= "table" then return end
  for _, button in ipairs(tabs) do add(list, button) end
end

-- Adds the side tabs a window (or its ModeTabs frame) holds, by key and in its Tabs array.
local function addSide(list, holder)
  if type(holder) ~= "table" then return end
  for _, key in ipairs(GW.SIDE_TABS) do add(list, holder[key]) end
  addArray(list, holder.Tabs)
end

-- Adds the buttons a tab system holds, by its accessor (TabSystemMixin:GetTabButton(tabID), nil past the last).
local function addSystem(list, system)
  if type(system) ~= "table" or type(system.GetTabButton) ~= "function" then return end
  for id = 1, GW.MAX_TABS * 3 do
    local button = system:GetTabButton(id)
    if not button then return end
    add(list, button)
  end
end

-- Adds the buttons a PanelTemplates window names <window>Tab1 ... Tab8.
local function addNamed(list, name)
  for i = 1, GW.MAX_TABS do add(list, name and _G[name .. "Tab" .. i]) end
end

-- Every tab button a window has now: its Tabs array and side tabs, its named tabs and its tab systems'.
function GW.TabButtons(frame)
  local list = { seen = {} }
  addSide(list, frame)
  addSide(list, frame.ModeTabs)
  addNamed(list, frame.GetName and frame:GetName())
  for _, path in ipairs(GW.TAB_SYSTEMS) do addSystem(list, walk(frame, path)) end
  return list
end

-- A side tab's checked state now, or nil when it can't be told (a CheckButton knows; a LargeSideTab shows it).
local function checkedNow(tab)
  if type(tab.GetChecked) == "function" then return tab:GetChecked() == true end
  if type(tab.SelectedTexture) == "table" then return tab.SelectedTexture:IsShown() end
end

-- The game checks a side tab as the window loads, before T.Tab hooks SetChecked: says the state once
-- more, so the accent line starts on the right tab.
local function seedChecked(tab)
  if tab.vgSeeded or type(tab.SetChecked) ~= "function" then return end
  tab.vgSeeded = true
  local on = checkedNow(tab)
  if on ~= nil then tab:SetChecked(on) end
end

-- The old right-side tab (RightSideTabTemplate) draws its frame as a texture with no key: faded, its icon kept.
local function fadeSideArt(tab)
  if tab.Background or tab.Left or type(tab.Icon) ~= "table" then return end
  T.FadeRegions(tab, { [tab.Icon] = true, [tab.IconOverlay or tab.Icon] = true })
end

-- One tab button in the theme, whichever template it came from.
local function dressTab(button)
  T.Tab(button)
  seedChecked(button)
  fadeSideArt(button)
end

-- Puts every tab button the window has now in the theme; a button that fails leaves the others alone.
function GW.DressTabs(frame)
  for _, button in ipairs(GW.TabButtons(frame)) do ns.Try("tab button", dressTab, button) end
  GW.FadeParts(frame, { "TabIndicators" })
end

-- Dresses the tabs a window's tab systems add later (they make their buttons as pages are set up).
local function watchSystems(frame)
  for _, path in ipairs(GW.TAB_SYSTEMS) do
    local system = walk(frame, path)
    if system and type(system.AddTab) == "function" then hooksecurefunc(system, "AddTab", function() GW.DressTabs(frame) end) end
  end
end

-- Dresses a window's tabs now and every time it shows, once per window.
local function dress(frame)
  if type(frame) ~= "table" or not frame.HookScript or dressed[frame] then return end
  dressed[frame] = true
  GW.DressTabs(frame)
  frame:HookScript("OnShow", GW.DressTabs)
  watchSystems(frame)
end

-- Whether the tabs of the window of that name are Vanguard's to dress: the switch is on and the
-- window's own group is on if it is registered (a window left to the game keeps the game's tabs).
local function wanted(name)
  local entry = GW.REGISTERED[name]
  return GW.settings and GW.settings.tabs and (not entry or GW.settings[entry.group]) or false
end

-- Dresses the window of that name, if the client has it and its tabs are wanted.
local function dressNamed(name)
  if wanted(name) then dress(_G[name]) end
end

-- Dresses the windows of those names.
local function dressAll(names)
  for _, name in ipairs(names) do dressNamed(name) end
end

-- A part of the game loaded: dress the tabs of the windows registered for it, and the side-tab windows.
local function onLoaded(_, addon)
  dressAll(GW.ON_DEMAND[addon] or {})
  dressAll(GW.TAB_WINDOWS)
end

-- At login, after the Windows module enabled: every window registered now and the side-tab windows,
-- and later those that load with their part of the game.
local function enable()
  if not (GW.settings and GW.settings.tabs) then return end
  dressAll(GW.ORDER)
  dressAll(GW.TAB_WINDOWS)
  ns.On("ADDON_LOADED", onLoaded)
end

ns.On("PLAYER_LOGIN", enable)
