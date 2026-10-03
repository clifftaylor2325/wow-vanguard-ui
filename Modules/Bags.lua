-- Bags: turns on the client's combined bag (one window for every bag) and
-- restyles it and the bank: flat themed panels, template art faded, square
-- item slots with thin borders in each item's quality color, and the search
-- boxes in the theme. The windows and their item buttons stay the client's
-- own, so using, dragging, searching and sorting items work exactly as
-- before; this module only changes how they look.

local ADDON, ns = ...

local T = ns.Theme

local BG = ns.Module("Bags", {
  defaults = { combined = true, bank = true },
})

-- Item button regions whose art is faded (the icon and texts stay).
local ITEM_ART = { "NormalTexture", "IconBorder", "ItemContextOverlay" }

-- The client's combined bag window, or nil if it doesn't have one.
local function combinedFrame()
  return _G.ContainerFrameCombinedBags
end

-- Turns on the combined bag setting, if this client has it.
local function useCombined()
  local set = C_CVar and C_CVar.SetCVar or SetCVar
  if type(set) == "function" then
    pcall(set, "combinedBags", "1")
  end
end

-- Whether any of r, g, b is a secret (never compared).
local function anySecret(r, g, b)
  return ns.IsSecret(r) or ns.IsSecret(g) or ns.IsSecret(b)
end

-- Whether the slot's border already shows r, g, b (nil r: the theme's border).
local function unchanged(button, r, g, b)
  local last = button.fuiBorder
  if last == nil or anySecret(r, g, b) then return false end
  if r == nil then return last == false end
  return last ~= false and last[1] == r and last[2] == g and last[3] == b
end

-- Paints the slot's border r, g, b (nil r: the theme's), only when that is a change.
local function paintQuality(button, r, g, b)
  if unchanged(button, r, g, b) then return end
  local rgb = r ~= nil and { r, g, b } or nil
  T.SetBorder(button, rgb)
  button.fuiBorder = rgb or false
  if anySecret(r, g, b) then button.fuiBorder = nil end
end

-- Puts the item's quality color (the game sets it on its own border, which is
-- faded here) on ForeverUI's border instead; no quality, the theme's border.
local function followQuality(button)
  local border = button.IconBorder
  if type(border) ~= "table" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(border, "SetVertexColor", function(_, r, g, b) paintQuality(button, r, g, b) end)
  hooksecurefunc(border, "Hide", function() paintQuality(button, nil) end)
end

-- Fades an item button's slot art and gives it a thin border in its quality
-- color. Once per button: the game reuses its buttons and never undoes this.
local function skinItem(button)
  if button.fuiSkinned then return end
  button.fuiSkinned = true
  for _, key in ipairs(ITEM_ART) do
    local region = button[key] or (button["Get" .. key] and button["Get" .. key](button))
    if type(region) == "table" and region.SetAlpha then region:SetAlpha(0) end
  end
  local icon = button.icon or button.Icon
  if icon and icon.SetTexCoord then icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) end
  T.Panel(button, { inset = true, noBg = true })
  followQuality(button)
end

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

-- A Sort button at the top of the window, if the client can sort bags.
function BG.AddSort(frame)
  local sort = C_Container and C_Container.SortBags
  if type(sort) ~= "function" or BG.sort then return end
  BG.sort = ns.DialogButton(frame, "Sort", 52)
  BG.sort:SetHeight(20)
  BG.sort:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -30, -6)
  BG.sort:SetScript("OnClick", function() sort() end)
end

-- Module entry point (Core/Modules.lua): combined bags on, the window skinned
-- on every show, and slots the game adds (a bag swapped in) when it fills them.
function BG.Enable(settings)
  if settings.combined then useCombined() end
  if settings.bank then watchBank() end
  local frame = combinedFrame()
  if not frame then return end
  BG.AddSort(frame)
  frame:HookScript("OnShow", BG.SkinWindow)
  if type(frame.UpdateItems) == "function" and type(hooksecurefunc) == "function" then
    hooksecurefunc(frame, "UpdateItems", skinItems)
  end
end
