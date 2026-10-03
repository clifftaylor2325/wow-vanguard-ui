-- A "ForeverUI" button on the game menu (Escape), so the options are a click
-- away without typing /fui. The button is ForeverUI's own child of the menu,
-- laid out first by the menu's own layout (layoutIndex 0), above the game's
-- buttons. A menu without that layout gets a themed button just under it.

local ADDON, ns = ...

-- Sorts before the menu's own buttons, which the game numbers from 1 (MainMenuFrameTemplates.lua).
local FIRST = 0
-- The gap under the button: the menu's own section gap (MainMenuFrameMixin:AddSection's default).
local SECTION_GAP = 20

-- Closes the game menu and opens ForeverUI's options.
function ns.OpenFromGameMenu()
  local menu = _G.GameMenuFrame
  if type(HideUIPanel) == "function" then HideUIPanel(menu) else menu:Hide() end
  ns.Options.Show()
end

-- A button that looks like the menu's own when the menu names their template, else a themed one.
local function menuButton(menu)
  local template = menu.buttonTemplate
  if type(template) ~= "string" then return ns.DialogButton(menu, "ForeverUI", 200) end
  local b = CreateFrame("Button", nil, menu, template)
  b:SetText("ForeverUI")
  return b
end

-- ForeverUI's button first in a menu that lays its children out by layoutIndex, with a section gap under it.
local function addFirst(menu)
  local b = menuButton(menu)
  b.layoutIndex = FIRST
  b.bottomPadding = SECTION_GAP
  b:SetScript("OnClick", ns.OpenFromGameMenu)
  ns.gameMenuButton = b
  if type(menu.MarkDirty) == "function" then menu:MarkDirty() end
end

-- A themed button just under a menu that can't take new buttons.
local function addBelow(menu)
  local b = ns.DialogButton(menu, "ForeverUI", 144)
  b:SetPoint("TOP", menu, "BOTTOM", 0, -4)
  b:SetScript("OnClick", ns.OpenFromGameMenu)
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
