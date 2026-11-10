-- A "Vanguard" button on the game menu (Escape), so the options are a click
-- away without typing /vg. The button is Vanguard's own child of the menu,
-- laid out first by the menu's own layout (layoutIndex 0), above the game's
-- buttons. A menu without that layout gets a themed button just under it.

local ADDON, ns = ...
local L = ns.L

-- Sorts before the menu's own buttons, which the game numbers from 1 (MainMenuFrameTemplates.lua).
local FIRST = 0
-- The gap under the button: the menu's own section gap (MainMenuFrameMixin:AddSection's default).
local SECTION_GAP = 20

-- Closes the game menu, out of a fight only: the panel manager refuses addon code in combat (Core/Combat.lua,
-- ns.WindowWaitsForCombat), so there the menu is left as it is and Escape closes it.
local function closeMenu(menu)
  if ns.InCombat() then return end
  if type(HideUIPanel) == "function" then HideUIPanel(menu) else menu:Hide() end
end

-- Closes the game menu (closeMenu) and opens Vanguard's options.
function ns.OpenFromGameMenu()
  closeMenu(_G.GameMenuFrame)
  ns.Options.Show()
end

-- A button that looks like the menu's own when the menu names their template, else a themed one.
local function menuButton(menu)
  local template = menu.buttonTemplate
  if type(template) ~= "string" then return ns.DialogButton(menu, L["Vanguard"], 200) end
  local b = CreateFrame("Button", nil, menu, template)
  b:SetText(L["Vanguard"])
  return b
end

-- Vanguard's button first in a menu that lays its children out by layoutIndex, with a section gap under it.
local function addFirst(menu)
  local b = menuButton(menu)
  b.layoutIndex = FIRST
  b.bottomPadding = SECTION_GAP
  b:SetScript("OnClick", ns.Guard("click open options from game menu", ns.OpenFromGameMenu))
  ns.gameMenuButton = b
  if type(menu.MarkDirty) == "function" then menu:MarkDirty() end
end

-- A themed button just under a menu that can't take new buttons.
local function addBelow(menu)
  local b = ns.DialogButton(menu, "Vanguard", 144)
  b:SetPoint("TOP", menu, "BOTTOM", 0, -4)
  b:SetScript("OnClick", ns.Guard("click open options from game menu", ns.OpenFromGameMenu))
  ns.gameMenuButton = b
end

-- Puts the button on the game menu: first in a menu with a Layout method; any other menu,
-- or one whose button could not be built, gets the themed button under it.
local function addButton()
  local menu = _G.GameMenuFrame
  if type(menu) ~= "table" then return end
  if type(menu.Layout) == "function" and ns.Try("GameMenu", addFirst, menu) then return end
  addBelow(menu)
end

ns.On("PLAYER_LOGIN", addButton)
