-- Bags: turns on the client's combined bag (one window for every bag) when
-- the module's setting says so, and restyles it and the bank: flat themed panels, template art faded, square
-- item slots with thin borders in each item's quality color, and the search
-- boxes in the theme. The windows and their item buttons stay the client's
-- own, so using, dragging, searching and sorting items work exactly as
-- before; this module only changes how they look, and (Modules/BagSections.lua)
-- where the combined bag's slots sit: in sections by kind of item.

local ADDON, ns = ...

local T = ns.Theme

local BG = ns.Module("Bags", {
  defaults = { combined = true, bank = true, sections = true },
})

-- The combined bag's inner padding: its slots, section headers, Sort button and
-- money line sit this far inside the window's edges (on the theme's 4 px grid).
BG.PAD = 12
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
  local last = button.vgBorder
  if last == nil or anySecret(r, g, b) then return false end
  if r == nil then return last == false end
  return last ~= false and last[1] == r and last[2] == g and last[3] == b
end

-- Paints the slot's border r, g, b (nil r: the theme's), only when that is a change.
local function paintQuality(button, r, g, b)
  if unchanged(button, r, g, b) then return end
  local rgb = r ~= nil and { r, g, b } or nil
  T.SetBorder(button, rgb)
  button.vgBorder = rgb or false
  if anySecret(r, g, b) then button.vgBorder = nil end
end

-- Puts the item's quality color (the game sets it on its own border, which is
-- faded here) on Vanguard's border instead; no quality, the theme's border.
local function followQuality(button)
  local border = button.IconBorder
  if type(border) ~= "table" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(border, "SetVertexColor", function(_, r, g, b) paintQuality(button, r, g, b) end)
  hooksecurefunc(border, "Hide", function() paintQuality(button, nil) end)
end

-- Fades an item button's slot art and gives it a thin border in its quality
-- color. Once per button: the game reuses its buttons and never undoes this.
-- A slot with no button yet (a bag window the game hasn't filled) is skipped.
local function skinItem(button)
  if type(button) ~= "table" or button.vgSkinned then return end
  button.vgSkinned = true
  for _, key in ipairs(ITEM_ART) do
    local region = button[key] or (button["Get" .. key] and button["Get" .. key](button))
    if type(region) == "table" and region.SetAlpha then region:SetAlpha(0) end
  end
  local icon = button.icon or button.Icon
  if icon and icon.SetTexCoord then icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) end
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
    for _, button in frame:EnumerateValidItems() do skinItem(button) end
  elseif type(pool) == "table" and type(pool.EnumerateActive) == "function" then
    for button in pool:EnumerateActive() do skinItem(button) end
  end
end

-- The game's item search box in the theme, where it has one.
local function skinSearch(name)
  local box = _G[name]
  if type(box) == "table" and box.SetText then T.EditBox(box) end
end

-- Skins the window and its item buttons, on every show (the window's art is
-- faded again in case the game restored it; slots already skinned are skipped).
function BG.SkinWindow(frame)
  T.FadeRegions(frame)
  if frame.NineSlice then T.FadeRegions(frame.NineSlice) end
  T.Panel(frame, { shadow = true })
  skinItems(frame)
  skinSearch("BagItemSearchBox")
end

-- The bank's current tab: its item buttons in the theme (the window itself is skinned on show).
function BG.SkinBankItems()
  skinItems(_G.BankPanel)
  skinSearch("BankItemSearchBox")
end

-- The bank window and its slots, whenever it opens or shows another tab.
local function watchBank()
  local bank, panel = _G.BankFrame, _G.BankPanel
  if type(bank) ~= "table" or type(panel) ~= "table" then return end
  bank:HookScript("OnShow", function() ns.GetModule("Windows").Skin(bank) BG.SkinBankItems() end)
  if type(panel.GenerateItemSlotsForSelectedTab) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(panel, "GenerateItemSlotsForSelectedTab", BG.SkinBankItems)
  end
end

-- The game's own sort button, kept hidden (the game shows it on every update
-- of the bag's search row) because Vanguard's Sort takes its place.
local function hideGameSort()
  local game = _G.BagItemAutoSortButton
  if type(game) ~= "table" then return end
  game:Hide()
  if type(hooksecurefunc) == "function" then hooksecurefunc(game, "Show", game.Hide) end
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

-- Narrows the game's search box (it keeps the game's left edge, clear of the
-- bag's portrait) so Sort, right of it, ends the padding inside the window's right edge.
function BG.FitSearch(frame)
  local box = _G.BagItemSearchBox
  if not BG.sort or type(box) ~= "table" or box:GetParent() ~= frame then return end
  local _, _, _, left = box:GetPoint(1)
  box:SetWidth(frame:GetWidth() - BG.PAD - SORT_W - SORT_GAP - (left or 0))
end

-- The search box fitted each time the game sets up the bag's search row (it
-- gives the box its own width then), when the client has that call.
local function watchSearchRow(frame)
  if type(frame.UpdateSearchBox) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(frame, "UpdateSearchBox", BG.FitSearch)
end

-- A Sort button beside the search box, if the client can sort bags; the game's own is hidden.
function BG.AddSort(frame)
  local sort = C_Container and C_Container.SortBags
  if type(sort) ~= "function" or BG.sort then return end
  BG.sort = ns.DialogButton(frame, "Sort", SORT_W)
  BG.sort:SetHeight(20)
  placeSort(frame)
  BG.sort:SetScript("OnClick", function() sort() end)
  hideGameSort()
  watchSearchRow(frame)
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
  frame:HookScript("OnShow", BG.SkinWindow)
  if type(frame.UpdateItems) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(frame, "UpdateItems", skinItems)
  end
  BG.WatchSections(frame)
end
