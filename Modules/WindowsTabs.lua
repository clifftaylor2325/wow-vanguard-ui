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

-- Adds a tab button to the list (anything that takes a script hook is one).
local function add(list, button)
  if type(button) == "table" and button.HookScript then list[#list + 1] = button end
end

-- Adds the buttons of a window's parentArray of tabs (Tabs: PanelTabButtonTemplate's).
local function addArray(list, tabs)
  if type(tabs) ~= "table" then return end
  for _, button in ipairs(tabs) do add(list, button) end
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

-- Every tab button a window has now: its Tabs array, its named tabs and its tab systems'.
function GW.TabButtons(frame)
  local list = {}
  addArray(list, frame.Tabs)
  addNamed(list, frame.GetName and frame:GetName())
  for _, path in ipairs(GW.TAB_SYSTEMS) do addSystem(list, walk(frame, path)) end
  return list
end

-- Puts every tab button the window has now in the theme.
function GW.DressTabs(frame)
  for _, button in ipairs(GW.TabButtons(frame)) do T.Tab(button) end
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

-- A part of the game loaded: dress the tabs of the windows registered for it.
local function onLoaded(_, addon)
  for _, name in ipairs(GW.ON_DEMAND[addon] or {}) do dressNamed(name) end
end

-- At login, after the Windows module enabled: every window registered now, and later the on-demand ones.
local function enable()
  if not (GW.settings and GW.settings.tabs) then return end
  for _, name in ipairs(GW.ORDER) do dressNamed(name) end
  ns.On("ADDON_LOADED", onLoaded)
end

ns.On("PLAYER_LOGIN", enable)
