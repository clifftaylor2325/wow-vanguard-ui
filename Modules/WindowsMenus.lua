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
-- textures are touched: never its rows, which run the unit menu's secure actions, its anchors or its keys. A long menu's
-- scroll bar (a child of the menu, made with it) is put in the theme through the theme's own side tables, so nothing is
-- written on the menu.
function GW.SkinContextMenu(_, menu)
  if not (GW.settings and GW.settings.menus) then return end
  if type(menu) ~= "table" or type(menu.GetRegions) ~= "function" then return end
  T.FadeRegions(menu)
  local glow = menu.FrameGlow
  if type(glow) == "table" and glow.SetAlpha then glow:SetAlpha(0) end
  if type(menu.ScrollBar) == "table" then T.ScrollBar(menu.ScrollBar) end
  menuPanel(menu)
end

-- Listens for menus opening, where the client has the menu system's hook. Done at load, before
-- the group's switch can be read: GW.SkinContextMenu reads it on each open.
function GW.WatchMenus()
  local registry = _G.EventRegistry
  if type(registry) ~= "table" or type(registry.RegisterCallback) ~= "function" then return end
  registry:RegisterCallback("MenuProxy.OnShow", ns.Guard("skin context menu", GW.SkinContextMenu), GW)
end

GW.WatchMenus()

-- The old dropdown lists (UIDropDownMenu) ---------------------------------------------------

-- The three levels of the old dropdown menu some panels still use (UIDropDownListTemplate).
GW.DROPDOWN_LISTS = { "DropDownList1", "DropDownList2", "DropDownList3" }

-- One old dropdown list in the theme: both of its backdrops faded (<list>Backdrop, the dark dialog
-- border also kept as .Border, and <list>MenuBackdrop, the tooltip one; the game shows one or the
-- other by Show/Hide, so their alpha stays), a tooltip panel behind it. Its buttons and their
-- highlight are the game's.
function GW.SkinDropDownList(list)
  local name = list:GetName() or ""
  GW.FadeNamed({ name .. "Backdrop", name .. "MenuBackdrop" })
  if type(list.Border) == "table" and list.Border.SetAlpha then list.Border:SetAlpha(0) end
  T.Tooltip(list)
end

GW.Add("menus", "framed", GW.DROPDOWN_LISTS, GW.SkinDropDownList)

-- A heading row's text (the game's disabled gold font) in the text colour, by the row's text name; only the colour
-- changes, by r, g, b so a later row filled into the same button is not recoloured by a theme refresh.
local function colorHeading(name)
  local fs = _G[name]
  if type(fs) == "table" and fs.SetTextColor then T.Color(fs, T.RGB("text")) end
end

-- A row's tick or box glyph (the game's gold art on a plain texture) in a theme colour: greyed first so the colour
-- reads true. A row with an icon of its own (a custom check) is shown in the icon's own colours (white).
local function tintGlyph(glyph, token, custom)
  if type(glyph) ~= "table" or not glyph.SetVertexColor then return end
  if not custom and glyph.SetDesaturated then glyph:SetDesaturated(true) end
  T.Tint(glyph, custom and "white" or token)
end

-- The row the game's UIDropDownMenu_AddButton(info, level) just made: a heading's text in the text colour, the tick in the
-- accent and the empty box in the quiet text colour. The row's highlight and the rest stay the game's.
local function dressDropdownRow(info, level)
  local list = _G["DropDownList" .. (level or 1)]
  if not (GW.settings and GW.settings.menus) or type(info) ~= "table" or type(list) ~= "table" then return end
  local row = (list:GetName() or "") .. "Button" .. tostring(list.numButtons)
  if info.isTitle then colorHeading(row .. "NormalText") end
  if info.notCheckable then return end
  local custom = info.customCheckIconAtlas or info.customCheckIconTexture
  tintGlyph(_G[row .. "Check"], "accentText", custom)
  tintGlyph(_G[row .. "UnCheck"], "text2", custom)
end

-- Listens for the old dropdown's rows being made, where the client has the call. Done at login, after the game's
-- own files have loaded; the menus group's switch is read on each row.
function GW.WatchDropdownRows()
  if type(hooksecurefunc) ~= "function" or type(_G.UIDropDownMenu_AddButton) ~= "function" then return end
  hooksecurefunc("UIDropDownMenu_AddButton", ns.Guard("hook UIDropDownMenu_AddButton", dressDropdownRow))
end

ns.On("PLAYER_LOGIN", GW.WatchDropdownRows)
