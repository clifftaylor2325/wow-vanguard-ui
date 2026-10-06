-- Tooltips in the Vanguard look: a flat panel instead of the default art,
-- a border in the class (or reaction) color of the unit you're looking at,
-- the unit's name in that color, and a "Target:" line. The default tooltip
-- can sit in a movable corner, follow the cursor, or stay where the client
-- puts it, and unit tooltips can be hidden in combat. Item tooltips show what
-- the item sells for (the stack's worth, unless the client already shows it),
-- how many you have (bags and bank), and optionally the item's ID; other modules
-- add their own item lines after those (TT.AddItemLines).
--
-- Written for WoW Forever. Every client call is looked up when used. The
-- tooltip's text is never read: in Midnight some of it is hidden from
-- addons, so this module only colors lines and adds its own.

local ADDON, ns = ...

local T = ns.Theme

local TT = ns.Module("Tooltips", {
  defaults = { anchor = "corner", classBorder = true, targetLine = true, hideInCombat = false, sellPrice = true, itemCount = true, itemID = false },
})

TT.NAMES = { "GameTooltip", "ItemRefTooltip", "ShoppingTooltip1", "ShoppingTooltip2", "EmbeddedItemTooltip" }
-- More of the client's tooltips and tooltip-like boxes, skinned while the game windows' "menus" group is
-- on too (its switch: "Right-click menus, dropdowns and more tooltips"). Ones a client lacks are skipped.
TT.MORE_NAMES = {
  "ItemRefShoppingTooltip1", "ItemRefShoppingTooltip2", "GameNoHeaderTooltip", "GameSmallHeaderTooltip", "BuffFrameTooltip",
  "QuickKeybindTooltip", "SettingsTooltip", "PartyMemberBuffTooltip", "AutoCompleteBox",
}
-- The client's tooltip fonts -> size before Text size, and bold.
TT.FONTS = { GameTooltipHeaderText = { 14, true }, GameTooltipText = { 12 }, GameTooltipTextSmall = { 11 } }

-- Skinning ---------------------------------------------------------------------------------

-- Flat panel on one tooltip, its default art hidden (alpha only, so the client's layout is untouched).
local function skin(tt)
  if type(tt) ~= "table" or tt.vgSkinned then return end
  tt.vgSkinned = true
  T.Tooltip(tt)
end

-- The unit health bar under the default tooltip: flat texture.
local function skinHealthBar()
  local bar = _G.GameTooltipStatusBar
  if type(bar) ~= "table" or not bar.SetStatusBarTexture then return end
  T.StyleBar(bar)
end

-- The theme font, scaled by Text size, on the client's tooltip fonts (those it has), kept
-- after every theme change.
function TT.ApplyFonts()
  T.FontObjects(TT.FONTS)
end

-- Whether the game windows' menus group is on (the Windows module enables before this one).
local function moreWanted()
  local settings = ns.GetModule("Windows").settings
  return settings ~= nil and settings.menus == true
end

-- Skins every tooltip this client has (TT.MORE_NAMES with the menus group on).
function TT.SkinAll()
  for _, name in ipairs(TT.NAMES) do skin(_G[name]) end
  if moreWanted() then
    for _, name in ipairs(TT.MORE_NAMES) do skin(_G[name]) end
  end
  skinHealthBar()
end

-- Units -------------------------------------------------------------------------------------

-- The unit a tooltip shows, or nil (none, or hidden from addons).
function TT.Unit(tt)
  if not tt.GetUnit then return nil end
  local _, unit = tt:GetUnit()
  if ns.IsSecret(unit) or type(unit) ~= "string" then return nil end
  return unit
end

-- r, g, b for a unit: class color for players, reaction color otherwise.
local function unitColor(unit)
  return ns.GetModule("UnitFrames").HealthColor(unit)
end

-- "Target: <name>" in the target's color, when the unit has a target you can name.
local function addTarget(tt, unit)
  local target = unit .. "target"
  if not UnitExists(target) then return end
  local name = UnitName(target)
  if ns.IsSecret(name) or type(name) ~= "string" then return end
  tt:AddLine("Target: " .. name, unitColor(target))
end

-- Colors the name line and border, and adds the target line.
local function decorate(tt, unit)
  local r, g, b = unitColor(unit)
  local first = _G[tt:GetName() .. "TextLeft1"]
  if first then first:SetTextColor(r, g, b) end
  if TT.settings.classBorder then T.SetBorder(tt, { r, g, b }) end
  if TT.settings.targetLine then addTarget(tt, unit) end
end

-- A unit tooltip was filled in: decorate it, or hide it in combat if asked.
function TT.OnUnit(tt)
  if tt ~= _G.GameTooltip then return end
  local unit = TT.Unit(tt)
  if not unit then return T.SetBorder(tt, nil) end
  if TT.settings.hideInCombat and ns.InCombat() then return tt:Hide() end
  decorate(tt, unit)
end

-- Any tooltip hid: its border goes back to the theme's.
local function onHide(tt)
  T.SetBorder(tt, nil)
end

-- Sell price --------------------------------------------------------------------------------

-- What one of an item sells for (copper), or nil: not cached yet, no value, or hidden.
function TT.SellPrice(link)
  local info = C_Item and C_Item.GetItemInfo
  if type(info) ~= "function" or type(link) ~= "string" then return nil end
  local price = ns.PlainNumber((select(11, info(link))))
  if price and price > 0 then return price end
end

-- How many the item button under the tooltip holds (1 when it can't say); auction prices use
-- it for their stack line too.
function TT.StackOf(tt)
  local owner = tt.GetOwner and tt:GetOwner()
  local count = type(owner) == "table" and ns.PlainNumber(owner.count)
  return count and count > 1 and count or 1
end

-- What the stack sells for, unless the client already shows a price.
local function addPrice(tt, link)
  local price = (tonumber(tt.shownMoneyFrames) or 0) == 0 and TT.SellPrice(link)
  if not price then return end
  local r, g, b = T.RGB("text2")
  tt:AddDoubleLine("Sells for", ns.GetModule("InfoStrip").Money(price * TT.StackOf(tt)), r, g, b, T.RGB("gold"))
end

-- How many you have (in your bags and bank), or nil when none or the client can't say.
function TT.Owned(link)
  local count = C_Item and C_Item.GetItemCount
  if type(count) ~= "function" then return nil end
  local bags, all = ns.PlainNumber(count(link)), ns.PlainNumber(count(link, true))
  if all and all > 0 then return bags or all, all end
end

-- "You have 12" (and how many of those are in the bank).
local function addCount(tt, link)
  local bags, all = TT.Owned(link)
  if not all then return end
  local text = "You have " .. all .. (all > bags and string.format(" (%d in the bank)", all - bags) or "")
  tt:AddLine(text, T.RGB("text2"))
end

-- The item's ID, for players who look items up.
local function addID(tt, link)
  local id = link:match("item:(%d+)")
  if id then tt:AddLine("Item ID " .. id, T.RGB("text2")) end
end

-- Other modules' item lines, each fn(tt, link), run in the order added after the tooltip's own.
TT.itemLines = {}

-- Adds fn(tt, link) to every item tooltip, after Vanguard's own lines: the shared
-- extension point (Vendor memory's "Sold by", auction prices). link is a plain item link.
function TT.AddItemLines(fn)
  TT.itemLines[#TT.itemLines + 1] = fn
end

-- An item tooltip was filled in: add the switched-on lines, then other modules' (one
-- that fails is reported and doesn't stop the rest).
function TT.OnItem(tt)
  if not tt.GetItem then return end
  local _, link = tt:GetItem()
  if ns.IsSecret(link) or type(link) ~= "string" then return end
  if TT.settings.sellPrice then addPrice(tt, link) end
  if TT.settings.itemCount then addCount(tt, link) end
  if TT.settings.itemID then addID(tt, link) end
  for _, fn in ipairs(TT.itemLines) do ns.Try("tooltip lines", fn, tt, link) end
end

-- Hooks ------------------------------------------------------------------------------------

-- Calls fn after the client fills a tooltip of one kind (new data API, else the old script).
local function hookFilled(kind, script, fn)
  local processor, kinds = _G.TooltipDataProcessor, _G.Enum and _G.Enum.TooltipDataType
  if type(processor) == "table" and processor.AddTooltipPostCall and kinds and kinds[kind] then
    return processor.AddTooltipPostCall(kinds[kind], fn)
  end
  local tt = _G.GameTooltip
  if tt and tt.HasScript and tt:HasScript(script) then tt:HookScript(script, fn) end
end

-- Decorates unit tooltips and adds sell prices to item tooltips as the client fills them.
local function hookTooltips()
  hookFilled("Unit", "OnTooltipSetUnit", TT.OnUnit)
  hookFilled("Item", "OnTooltipSetItem", TT.OnItem)
end

-- Anchoring --------------------------------------------------------------------------------

-- Moves a tooltip given the default anchor: to the corner frame, the cursor, or left alone.
function TT.Anchor(tt, parent)
  local where = TT.settings.anchor
  if where == "cursor" then return tt:SetOwner(parent, "ANCHOR_CURSOR") end
  if where ~= "corner" then return end
  tt:SetOwner(parent, "ANCHOR_NONE")
  tt:ClearAllPoints()
  tt:SetPoint("BOTTOMRIGHT", TT.corner, "BOTTOMRIGHT")
end

-- The movable corner frame the tooltip sits in (unlock mode shows it).
local function buildCorner()
  TT.corner = CreateFrame("Frame", "Vanguard_TooltipAnchor", UIParent)
  TT.corner:SetSize(180, 56)
  ns.Mover(TT.corner, "tooltip", "Tooltip", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 186 })
end

-- Module entry point (Core/Modules.lua).
function TT.Enable(settings)
  TT.settings = settings
  buildCorner()
  TT.SkinAll()
  TT.ApplyFonts()
  hookTooltips()
  if _G.GameTooltip then _G.GameTooltip:HookScript("OnHide", onHide) end
  if type(hooksecurefunc) == "function" and type(_G.GameTooltip_SetDefaultAnchor) == "function" then
    hooksecurefunc("GameTooltip_SetDefaultAnchor", TT.Anchor)
  end
end
