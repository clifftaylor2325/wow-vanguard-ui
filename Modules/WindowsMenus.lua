-- Game windows, menus group: Right-click menus (the 12.x menu system) and the old dropdown lists, in the
-- Vanguard look. Filled by stream S5 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

-- The 12.x menus (Blizzard_Menu) ------------------------------------------------------------

-- The panel Vanguard keeps behind each menu frame: menu -> panel. Menu frames are pooled, and each
-- open lends the frame to a compositor that refuses CreateTexture on it and throws away every key
-- written to it when the menu closes (Blizzard_Menu/Compositor.lua, Menu.lua AcquireMenu), so the
-- panel is a frame of Vanguard's own, remembered here and not on the menu.
local menuPanels = {}

-- The panel behind a menu (made the first time that pooled frame opens), level with the menu so
-- its rows (which the game puts 20 levels above it) draw over the panel.
local function menuPanel(menu)
  local panel = menuPanels[menu]
  if not panel then
    panel = CreateFrame("Frame", nil, menu)
    panel:SetAllPoints(menu)
    T.Tooltip(panel)
    menuPanels[menu] = panel
  end
  panel:SetFrameStrata(menu:GetFrameStrata())
  panel:SetFrameLevel(menu:GetFrameLevel())
end

-- A menu just opened (EventRegistry "MenuProxy.OnShow", fired by MenuProxyMixin:OnShow), with the
-- menus group on: the background the game attached for this open faded, the gamepad focus glow
-- (Camelot's MenuTemplateBase.FrameGlow) faded, and the panel behind it. Only the menu frame's own
-- textures are touched: never its rows, which run the unit menu's secure actions, its anchors or its keys.
function GW.SkinContextMenu(_, menu)
  if not (GW.settings and GW.settings.menus) then return end
  if type(menu) ~= "table" or type(menu.GetRegions) ~= "function" then return end
  T.FadeRegions(menu)
  local glow = menu.FrameGlow
  if type(glow) == "table" and glow.SetAlpha then glow:SetAlpha(0) end
  menuPanel(menu)
end

-- Listens for menus opening, where the client has the menu system's hook. Done at load, before
-- the group's switch can be read: GW.SkinContextMenu reads it on each open.
function GW.WatchMenus()
  local registry = _G.EventRegistry
  if type(registry) ~= "table" or type(registry.RegisterCallback) ~= "function" then return end
  registry:RegisterCallback("MenuProxy.OnShow", GW.SkinContextMenu, GW)
end

GW.WatchMenus()
