-- Tooltips in the ForeverUI look: a flat panel instead of the default art,
-- a border in the class (or reaction) color of the unit you're looking at,
-- the unit's name in that color, and a "Target:" line. The default tooltip
-- can sit in a movable corner, follow the cursor, or stay where the client
-- puts it, and unit tooltips can be hidden in combat.
--
-- Written for WoW Forever. Every client call is looked up when used. The
-- tooltip's text is never read: in Midnight some of it is hidden from
-- addons, so this module only colors lines and adds its own.

local ADDON, ns = ...

local T = ns.Theme

local TT = ns.Module("Tooltips", {
  defaults = { anchor = "corner", classBorder = true, targetLine = true, hideInCombat = false },
})

TT.NAMES = { "GameTooltip", "ItemRefTooltip", "ShoppingTooltip1", "ShoppingTooltip2", "EmbeddedItemTooltip" }
-- The client's tooltip fonts -> size before Text size, and bold.
TT.FONTS = { GameTooltipHeaderText = { 14, true }, GameTooltipText = { 12 }, GameTooltipTextSmall = { 11 } }

-- Skinning ---------------------------------------------------------------------------------

-- Flat panel on one tooltip, its default art hidden (alpha only, so the client's layout is untouched).
local function skin(tt)
  if type(tt) ~= "table" or tt.fuiSkinned then return end
  tt.fuiSkinned = true
  T.Panel(tt, { alpha = 0.94, shadow = true })
  if tt.NineSlice then tt.NineSlice:SetAlpha(0) end
end

-- The unit health bar under the default tooltip: flat texture.
local function skinHealthBar()
  local bar = _G.GameTooltipStatusBar
  if type(bar) ~= "table" or not bar.SetStatusBarTexture then return end
  T.StyleBar(bar)
end

-- The theme font, scaled by Text size, on the client's tooltip fonts (those it has).
function TT.ApplyFonts()
  for name, f in pairs(TT.FONTS) do
    local font = _G[name]
    if type(font) == "table" and font.SetFont then
      local path, outline = T.Font(f[2])
      font:SetFont(path, T.ScaledSize(f[1]), outline)
    end
  end
end

-- Skins every tooltip this client has.
function TT.SkinAll()
  for _, name in ipairs(TT.NAMES) do skin(_G[name]) end
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

-- Calls TT.OnUnit after the client fills a unit tooltip (new data API, else the old script).
local function hookUnits()
  local processor, kinds = _G.TooltipDataProcessor, _G.Enum and _G.Enum.TooltipDataType
  if type(processor) == "table" and processor.AddTooltipPostCall and kinds and kinds.Unit then
    return processor.AddTooltipPostCall(kinds.Unit, TT.OnUnit)
  end
  local tt = _G.GameTooltip
  if tt and tt.HasScript and tt:HasScript("OnTooltipSetUnit") then tt:HookScript("OnTooltipSetUnit", TT.OnUnit) end
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
  TT.corner = CreateFrame("Frame", "ForeverUI_TooltipAnchor", UIParent)
  TT.corner:SetSize(180, 56)
  ns.Mover(TT.corner, "tooltip", "Tooltip", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 186 })
end

-- Module entry point (Core/Modules.lua).
function TT.Enable(settings)
  TT.settings = settings
  buildCorner()
  TT.SkinAll()
  TT.ApplyFonts()
  T.OnChanged(TT.ApplyFonts)
  hookUnits()
  if _G.GameTooltip then _G.GameTooltip:HookScript("OnHide", onHide) end
  if type(hooksecurefunc) == "function" and type(_G.GameTooltip_SetDefaultAnchor) == "function" then
    hooksecurefunc("GameTooltip_SetDefaultAnchor", TT.Anchor)
  end
end
