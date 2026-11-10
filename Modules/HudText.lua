-- The game's own HUD text in the theme font (on unless you switch the module off under /vg > Modules):
--   * the red error line, and the zone and subzone names shown as you enter a place;
--   * the game's scrolling combat text (when you turn it on in the game's options);
--   * the floating damage numbers over your target.
-- These were part of the Merchant helpers until they got this switch of their own, so turning the
-- merchant helpers off no longer changes a font. Nothing here is protected.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local HT = ns.Module("HudText", { defaults = {}, live = true,
  afterOff = L["Damage numbers keep Vanguard's font until you reload."] })

-- Whether the module runs now (its scope is open).
local function running()
  return HT.scope ~= nil and HT.scope:Running()
end

-- The HUD font objects as the game had them: name -> { path, size, flags, shadow = { x, y, r, g, b, a } }, read before
-- the theme first touches each one and kept here, never on the game's object. HT.GiveBack puts them back.
HT.was = {}

-- The shadow a font object has now, as { x, y, r, g, b, a }, or nil when the client can't say.
local function shadowOf(font)
  if type(font.GetShadowOffset) ~= "function" or type(font.GetShadowColor) ~= "function" then return nil end
  local x, y = font:GetShadowOffset()
  local r, g, b, a = font:GetShadowColor()
  return { x, y, r, g, b, a }
end

-- Notes the game's own face and shadow of each font object in map the first time, before the theme changes it.
local function remember(map)
  for name in pairs(map) do
    local font = _G[name]
    if HT.was[name] == nil and type(font) == "table" and type(font.GetFont) == "function" then
      local path, size, flags = font:GetFont()
      HT.was[name] = { ns.PlainText(path), ns.PlainNumber(size), ns.PlainText(flags) or "", shadow = shadowOf(font) }
    end
  end
end

-- Puts one font object's shadow back (only what was plain when it was read).
local function restoreShadow(font, shadow)
  if not shadow or type(font.SetShadowOffset) ~= "function" then return end
  if ns.PlainNumber(shadow[1]) and ns.PlainNumber(shadow[2]) then font:SetShadowOffset(shadow[1], shadow[2]) end
  if ns.PlainNumber(shadow[3]) and ns.PlainNumber(shadow[6]) then font:SetShadowColor(shadow[3], shadow[4], shadow[5], shadow[6]) end
end

-- Gives the game's own face and shadow back to every HUD font object the theme changed.
function HT.GiveBack()
  for name, was in pairs(HT.was) do
    local font = _G[name]
    if type(font) == "table" and type(font.SetFont) == "function" and was[1] and was[2] then
      font:SetFont(was[1], was[2], was[3])
      restoreShadow(font, was.shadow)
    end
  end
end

ns.Options.MODULE_INFO.HudText = { L["HUD text font"], L["The error line, zone names, combat text and damage numbers in Vanguard's font."] }

-- The HUD text in the theme font, with the theme's drop shadow in place of the game's
-- thick outline so it reads over the world. A font object the client lacks is skipped.
function HT.ThemeFonts()
  remember(T.FONT_OBJECTS.hud)
  T.FontObjects(T.FONT_OBJECTS.hud)
  for name in pairs(T.FONT_OBJECTS.hud) do
    local font = _G[name]
    if type(font) == "table" and font.SetShadowOffset then
      font:SetShadowOffset(1, -1)
      font:SetShadowColor(T.RGB("textShadow"))
    end
  end
end

-- True when a part of the game is loaded (a client without the call, or a hidden answer, counts as no).
local function partLoaded(name)
  local fn = C_AddOns and C_AddOns.IsAddOnLoaded
  local on = type(fn) == "function" and fn(name)
  return not ns.IsSecret(on) and on == true
end

-- The scrolling combat text in the theme font: when its part of the game has just loaded
-- (justLoaded, from ADDON_LOADED) or, at Enable, if the client says it is loaded already.
-- The game draws the lines in the font object's colour.
function HT.ThemeCombatText(justLoaded)
  if not (justLoaded or partLoaded("Blizzard_CombatText")) then return end
  remember(T.FONT_OBJECTS.combatText)
  T.FontObjects(T.FONT_OBJECTS.combatText)
end

-- The engine's floating damage numbers (over your target) in the theme font: the path the engine
-- reads, DAMAGE_TEXT_FONT, is set at Vanguard's own load, before the engine reads it, and again when
-- the module enables (after the login profile switch), unless the theme font is the game's own (Font
-- set to the game's, or a Korean or Chinese client), which keeps the game's damage font. A client
-- without the path is left alone.
function HT.ThemeDamageFont()
  local path = T.Font(true)
  if type(DAMAGE_TEXT_FONT) ~= "string" or path == STANDARD_TEXT_FONT then return end
  DAMAGE_TEXT_FONT = path
end

-- A part of the game loaded: Vanguard's own (its settings are back: the damage font, while the
-- module is on) or the scrolling combat text's (its font object, while the module runs).
local function onLoaded(_, name)
  if name == ADDON and ns.ModuleEnabled("HudText") then HT.ThemeDamageFont() end
  if name == "Blizzard_CombatText" and running() then HT.ThemeCombatText(true) end
end

-- Gates of a scope of its own that is always open: the damage font must be set when Vanguard itself loads, before
-- the module starts, and the theme's font list only grows, so a theme change while the module is off needs the
-- game's faces put back again (the gate's function does it, running last).
local early = ns.NewScope("HudText load")
early.on = true
early:Gate("loaded", onLoaded, function(gate) ns.On("ADDON_LOADED", gate) end)
early:Gate("theme", function() if not running() then HT.GiveBack() end end, T.OnChanged)

-- The module switched off (Core/Modules.lua): the HUD font objects get the game's faces back. The damage-number font
-- path was read by the engine at load, so it stays until a reload (afterOff).
function HT.Disable()
  HT.GiveBack()
end

-- Module entry point (Core/Modules.lua).
function HT.Enable(settings, scope)
  HT.settings, HT.scope = settings, scope
  HT.ThemeFonts()
  HT.ThemeCombatText()
  HT.ThemeDamageFont()
end
