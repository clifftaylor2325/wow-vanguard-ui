-- A "ForeverUI" button on the game menu (Escape), so the options are a click
-- away without typing /fui. The game builds its menu buttons each time the
-- menu opens; ForeverUI adds its own at the end, in its own section. A client
-- whose menu can't take new buttons gets a themed button just under the menu.

local ADDON, ns = ...

-- Closes the game menu and opens ForeverUI's options.
function ns.OpenFromGameMenu()
  local menu = _G.GameMenuFrame
  if type(HideUIPanel) == "function" then HideUIPanel(menu) else menu:Hide() end
  ns.Options.Show()
end

-- Adds the button as the game builds its menu (the menu clears its buttons each time).
local function addToMenu(menu)
  if type(menu.AddSection) == "function" then menu:AddSection() end
  menu:AddButton("ForeverUI", ns.OpenFromGameMenu)
end

-- A themed button just under a menu that can't take new buttons.
local function addBelow(menu)
  local b = ns.DialogButton(menu, "ForeverUI", 144)
  b:SetPoint("TOP", menu, "BOTTOM", 0, -4)
  b:SetScript("OnClick", ns.OpenFromGameMenu)
  ns.gameMenuButton = b
end

-- Puts the button on the game menu, the way this client's menu allows.
local function addButton()
  local menu = _G.GameMenuFrame
  if type(menu) ~= "table" then return end
  if type(menu.AddButton) == "function" and type(menu.InitButtons) == "function" and type(hooksecurefunc) == "function" then
    return hooksecurefunc(menu, "InitButtons", addToMenu)
  end
  addBelow(menu)
end

ns.On("PLAYER_LOGIN", addButton)
