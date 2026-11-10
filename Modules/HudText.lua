-- The game's own HUD text in the theme font (on unless you switch the module off under /vg > Modules):
--   * the red error line, and the zone and subzone names shown as you enter a place;
--   * the game's scrolling combat text (when you turn it on in the game's options);
--   * the floating damage numbers over your target.
-- These were part of the Merchant helpers until they got this switch of their own, so turning the
-- merchant helpers off no longer changes a font. Nothing here is protected.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local HT = ns.Module("HudText", { defaults = {} })

ns.Options.MODULE_INFO.HudText = { L["HUD text font"], L["The error line, zone names, combat text and damage numbers in Vanguard's font."] }

-- The HUD text in the theme font, with the theme's drop shadow in place of the game's
-- thick outline so it reads over the world. A font object the client lacks is skipped.
function HT.ThemeFonts()
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
  if justLoaded or partLoaded("Blizzard_CombatText") then T.FontObjects(T.FONT_OBJECTS.combatText) end
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
-- module is on) or the scrolling combat text's (its font object, once the module is enabled).
local function onLoaded(_, name)
  if name == ADDON and ns.ModuleEnabled("HudText") then HT.ThemeDamageFont() end
  if name == "Blizzard_CombatText" and HT.settings then HT.ThemeCombatText(true) end
end
ns.On("ADDON_LOADED", onLoaded)

-- Module entry point (Core/Modules.lua).
function HT.Enable(settings)
  HT.settings = settings
  HT.ThemeFonts()
  HT.ThemeCombatText()
  HT.ThemeDamageFont()
end
