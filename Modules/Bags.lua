-- Bags: turns on the client's combined bag (one window for every bag) when
-- the module's setting says so, and restyles it and the bank: flat themed panels, template art faded, square
-- item slots with thin borders in each item's quality color, and the search
-- boxes in the theme. The windows and their item buttons stay the client's
-- own, so using, dragging, searching and sorting items work exactly as
-- before; this module only changes how they look, and (Modules/BagSections.lua)
-- where the combined bag's slots sit: in sections by kind of item.

local ADDON, ns = ...
local L = ns.L

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")
local vgBorder = ns.FrameState("vgBorder")

local T = ns.Theme

local BG = ns.Module("Bags", {
  defaults = { combined = true, bank = true, sections = true, categories = {} },
})

-- The combined bag's inner padding: its slots, section headers, Sort button and
-- money line sit this far inside the window's edges (a panel's inset inside a window, T.SPACE.col).
BG.PAD = T.SPACE.col
-- The Sort button's width and the space between it and the search box.
local SORT_W, SORT_GAP = 52, 6

-- Item button regions whose art is faded (the icon and texts stay). Not the
-- context overlay: the game dims items that don't match a search with it.
local ITEM_ART = { "NormalTexture", "IconBorder" }

-- The client's combined bag window, or nil if it doesn't have one.
local function combinedFrame()
  return _G.ContainerFrameCombinedBags
end

-- The client's CVar function by name (C_CVar's, or the old global), or nil.
local function cvarCall(name)
  local fn = C_CVar and C_CVar[name] or _G[name]
  return type(fn) == "function" and fn or nil
end

-- Sets the combinedBags CVar to value (a failing call is ignored).
local function setCombinedCVar(value)
  local set = cvarCall("SetCVar")
  if set then pcall(set, "combinedBags", value) end
end

-- Applies the combined setting to the client once: the first time, and again
-- only when the setting changes, so the player's own choice in the game's
-- options stands between. The player's value from before is kept for Disable.
local function syncCombined(settings)
  if settings.applied == settings.combined then return end
  local get = cvarCall("GetCVar")
  if settings.applied == nil and get then settings.prior = get("combinedBags") end
  settings.applied = settings.combined
  setCombinedCVar(settings.combined and "1" or "0")
end

-- The module switched off (Core/Modules.lua): the player's own bag layout comes back.
function BG.Disable(settings)
  if settings.applied == nil then return end
  if settings.prior ~= nil then setCombinedCVar(settings.prior) end
  settings.applied, settings.prior = nil, nil
end

-- Whether any of r, g, b is a secret (never compared).
local function anySecret(r, g, b)
  return ns.IsSecret(r) or ns.IsSecret(g) or ns.IsSecret(b)
end

-- Whether the slot's border already shows r, g, b (nil r: the theme's border).
local function unchanged(button, r, g, b)
  local last = vgBorder[button]
  if last == nil or anySecret(r, g, b) then return false end
  if r == nil then return last == false end
  return last ~= false and last[1] == r and last[2] == g and last[3] == b
end

-- Paints the slot's border r, g, b (nil r: the theme's), only when that is a change.
local function paintQuality(button, r, g, b)
  if unchanged(button, r, g, b) then return end
  local rgb = r ~= nil and { r, g, b } or nil
  T.SetBorder(button, rgb)
  vgBorder[button] = rgb or false
  if anySecret(r, g, b) then vgBorder[button] = nil end
end

-- Puts the item's quality color (the game sets it on its own border, which is
-- faded here) on Vanguard's border instead; no quality, the theme's border.
local function followQuality(button)
  local border = button.IconBorder
  if type(border) ~= "table" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(border, "SetVertexColor", ns.Guard("hook SetVertexColor", function(_, r, g, b) paintQuality(button, r, g, b) end))
  hooksecurefunc(border, "Hide", ns.Guard("hook Hide", function() paintQuality(button, nil) end))
end

-- Fades an item button's slot art and gives it a thin border in its quality
-- color. Once per button: the game reuses its buttons and never undoes this.
-- A slot with no button yet (a bag window the game hasn't filled) is skipped.
local function skinItem(button)
  if type(button) ~= "table" or vgSkinned[button] then return end
  vgSkinned[button] = true
  for _, key in ipairs(ITEM_ART) do
    local region = button[key] or (button["Get" .. key] and button["Get" .. key](button))
    if type(region) == "table" and region.SetAlpha then region:SetAlpha(0) end
  end
  local icon = button.icon or button.Icon
  if icon and icon.SetTexCoord then T.Crop(icon) end
  T.Panel(button, { inset = true, noBg = true })
  followQuality(button)
end
-- The same for other windows' item buttons (mail attachments, the equipment flyout...).
BG.SkinItem = skinItem

-- Skins every item button the window shows right now (a bag window's, or the
-- bank panel's pool) that isn't skinned yet.
local function skinItems(frame)
  local pool = frame.itemButtonPool
  if type(frame.EnumerateValidItems) == "function" then
    -- The combined bag yields (index, button); the bank's pool yields (button, true).
    for first, second in frame:EnumerateValidItems() do skinItem(type(second) == "table" and second or first) end
  elseif type(pool) == "table" and type(pool.EnumerateActive) == "function" then
    for button in pool:EnumerateActive() do skinItem(button) end
  end
end

-- The game's item search box in the theme, where it has one.
local function skinSearch(name)
  local box = _G[name]
  if type(box) == "table" and box.SetText then T.EditBox(box) end
end

-- Skins the window and its item buttons, on every show: the game windows' skin (its art and portrait
-- faded again in case the game restored them, a padded panel, the theme's close button set evenly in
-- its corner, the title font); slots already skinned are skipped. The money line in its coin box
-- (the combined bag's, and the backpack window's) goes in the theme font on a flat inset.
function BG.SkinWindow(frame)
  ns.GetModule("Windows").Skin(frame)
  ns.GetModule("Windows").SkinCoinBox(frame.MoneyFrame)
  skinItems(frame)
  skinSearch("BagItemSearchBox")
end

-- The bank's current tab: its item buttons in the theme (the window itself is skinned on show).
function BG.SkinBankItems()
  skinItems(_G.BankPanel)
  skinSearch("BankItemSearchBox")
end

-- Skins the bank window and its item slots as the window opens or shows another tab.
local function skinBankWindow()
  ns.GetModule("Windows").Skin(_G.BankFrame)
  BG.SkinBankItems()
end

-- The bank window and its slots, whenever it opens or shows another tab.
local function watchBank()
  local bank, panel = _G.BankFrame, _G.BankPanel
  if type(bank) ~= "table" or type(panel) ~= "table" then return end
  bank:HookScript("OnShow", ns.Guard("show bank window", skinBankWindow))
  if type(panel.GenerateItemSlotsForSelectedTab) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(panel, "GenerateItemSlotsForSelectedTab", ns.Guard("hook GenerateItemSlotsForSelectedTab", BG.SkinBankItems))
  end
end

-- Hides the game's sort button while it sits on the combined bag, where Vanguard's Sort takes its place. On
-- the backpack window of separate bags it is the game's own and the only sort there, so it stays.
local function hideOnCombined(game)
  if game:GetParent() == combinedFrame() then game:Hide() end
end

-- The game's own sort button, hidden again each time the game shows it on the combined bag (every update of
-- a bag's search row hands the button to that bag before showing it, so the hook sees where it sits).
local function hideGameSort()
  local game = _G.BagItemAutoSortButton
  if type(game) ~= "table" then return end
  hideOnCombined(game)
  if type(hooksecurefunc) == "function" then hooksecurefunc(game, "Show", ns.Guard("hook Show", hideOnCombined)) end
end

-- Puts the Sort button on the search row: right of the search box, or where the
-- game's own sort button sat (the padding inside the right edge) when the client has no such box.
local function placeSort(frame)
  local box = _G.BagItemSearchBox
  if type(box) == "table" then
    BG.sort:SetPoint("LEFT", box, "RIGHT", SORT_GAP, 0)
  else
    BG.sort:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -BG.PAD, -34)
  end
end

-- Starts the game's search box the padding inside the window's left edge (the game left room there
-- for the bag's portrait, which the skin fades), when the game set it by its left side on the window's.
local function alignSearch(frame, box)
  local point, rel, relPoint, _, y = box:GetPoint(1)
  if rel ~= frame or type(point) ~= "string" or not point:find("LEFT") or not relPoint:find("LEFT") then return end
  box:SetPoint(point, rel, relPoint, BG.PAD, y)
end

-- The game's backpack button in the bag window's top-right corner, when it shows there: the client
-- parents its GamepadBagBar (Blizzard_MainMenuBarBagButtons) to the window at the corner and, with no
-- gamepad, leaves that bar's backpack button showing.
-- The gamepad bar's backpack button and its bar, where the client has them.
local function gamepadBackpack()
  local bar = _G.GamepadBagBar
  local button = type(bar) == "table" and bar.BackpackButton
  if type(button) == "table" then return button, bar end
end

-- That button when it shows on the bag window.
local function backpackButton(frame)
  local button, bar = gamepadBackpack()
  if not button or bar:GetParent() ~= frame then return nil end
  return bar:IsShown() and button:IsShown() and button or nil
end

-- Whether the game's gamepad interface is on (InputUtil, where the client has it).
local function gamepadUI()
  return type(InputUtil) == "table" and type(InputUtil.IsGamepadUIEnabled) == "function" and InputUtil.IsGamepadUIEnabled() == true
end

-- Hides the gamepad bar's backpack button while the gamepad interface is off.
local function hideIdleBackpack(button)
  if not gamepadUI() then button:Hide() end
end

-- The gamepad bar's backpack button, kept hidden without a gamepad (as its other bag buttons are): the client
-- leaves it showing in the bag window's top-right corner, over the search row, where it covered Sort. The bag
-- bar beside the menu has the same backpack. Hidden again whenever it shows (OnShow catches Show and SetShown
-- alike); with a gamepad it is the game's.
local function hideGamepadBackpack()
  local button = gamepadBackpack()
  if not button then return end
  hideIdleBackpack(button)
  button:HookScript("OnShow", ns.Guard("backpack button shown", hideIdleBackpack))
end

-- The room Sort leaves at the window's right edge: the padding, or the game's backpack button and the
-- gap left of it, so Sort sits beside that button, not under it.
local function rightRoom(frame)
  local button = backpackButton(frame)
  local left, right = button and button:GetLeft(), frame:GetRight()
  if not (left and right) then return BG.PAD end
  return math.max(BG.PAD, right - left + SORT_GAP)
end

-- Starts the game's search box at the left padding and narrows it so Sort, right of it, ends the padding
-- inside the window's right edge (left of the game's backpack button, when that shows in the corner).
function BG.FitSearch(frame)
  local box = _G.BagItemSearchBox
  if not BG.sort or type(box) ~= "table" or box:GetParent() ~= frame then return end
  alignSearch(frame, box)
  local _, _, _, left = box:GetPoint(1)
  box:SetWidth(frame:GetWidth() - rightRoom(frame) - BG.sort:GetWidth() - SORT_GAP - BG.ToolsWidth() - (left or 0))
end

-- The search box fitted each time the game sets up the bag's search row (it
-- gives the box its own width then), when the client has that call.
local function watchSearchRow(frame)
  if type(frame.UpdateSearchBox) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(frame, "UpdateSearchBox", ns.Guard("hook UpdateSearchBox", BG.FitSearch))
end

-- A Sort button beside the search box, if the client can sort bags; the game's own is hidden.
function BG.AddSort(frame)
  local sort = C_Container and C_Container.SortBags
  if type(sort) ~= "function" or BG.sort then return end
  BG.sort = ns.WidenToLabel(ns.DialogButton(frame, L["Sort"], SORT_W))
  BG.sort:SetHeight(T.CONTROL_H)
  placeSort(frame)
  BG.sort:SetScript("OnClick", ns.Guard("click sort bags", function() sort() end))
  hideGameSort()
  hideGamepadBackpack()
  watchSearchRow(frame)
  BG.AddTools(frame)
end

-- The combined bag's sections and its search words, and the bank's search words (Modules/BagSections.lua,
-- Modules/BagSearch.lua), and the search row's buttons refitted after a live Text size change.
local function watchLayout(frame)
  T.OnChanged(ns.Guard("resize bag tools", function() BG.ResizeTools(frame) end))
  BG.WatchSections(frame)
  BG.WatchSearch(frame)
  if type(_G.BankPanel) == "table" then BG.WatchBankSearch(_G.BankPanel) end
end

-- Module entry point (Core/Modules.lua): the combined setting applied to the
-- client when it changes, the window skinned on every show, slots the game
-- adds (a bag swapped in) when it fills them, and its slots in sections.
function BG.Enable(settings)
  syncCombined(settings)
  if settings.bank then watchBank() end
  local frame = combinedFrame()
  if not frame then return end
  BG.AddSort(frame)
  frame:HookScript("OnShow", ns.Guard("show bags window", BG.SkinWindow))
  if type(frame.UpdateItems) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(frame, "UpdateItems", ns.Guard("hook UpdateItems", skinItems))
  end
  watchLayout(frame)
end
