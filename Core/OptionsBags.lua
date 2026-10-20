-- The Bars and bags page (/vg): the XP and reputation bars, the bags and
-- bank, the menu strip and the quest tracker. Core/Options.lua has the
-- helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, liveSetting, check, append = O.Setting, O.LiveSetting, O.Check, O.Append

-- XP and reputation bars: which, their numbers, and when they're seen.
local function dataBarRows()
  local barsVisibility, barsWhen = O.VisibilityRows("XP and reputation bars", "DataBars", "visibility", "showWhen")
  return {
    { "header", "XP and reputation" },
    check("Experience bar", setting("DataBars", "xp", true)), check("Reputation bar", setting("DataBars", "reputation", true)),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, setting("DataBars", "text", true) },
    check("Experience tooltip on hover (kills to level, rested, quest XP)", setting("DataBars", "tooltip")),
    barsVisibility, barsWhen,
  }
end

-- Bags: the combined bag, the game's bank look and the sections.
local function bagRows()
  return {
    { "header", "Bags" },
    check("Combined bag (reload)", setting("Bags", "combined", true)), check("Bank in the Vanguard look (reload)", setting("Bags", "bank", true)),
    check("Combined bag in sections: equipment, consumables, quest items, junk",
      liveSetting("Bags", "sections", function() ns.GetModule("Bags").SectionsChanged() end)),
  }
end

-- The game's extras: the menu strip and the quest tracker (after a reload).
local function gamePartRows()
  local menuVisibility, menuWhen = O.VisibilityRows("Bags and game menu", "MenuStrip", "menu", "menuWhen", ns.Visibility.MENU_MODES)
  return {
    { "header", "The game's extras" },
    menuVisibility, menuWhen,
    check("Vanguard icons on the menu buttons (reload)", setting("MenuStrip", "glyphs", true)),
    check("The game's quest tracker under the info strip (reload)", setting("MenuStrip", "tracker", true)),
    check("The game's quest tracker in the Vanguard look (reload)", setting("MenuStrip", "trackerLook", true)),
  }
end

-- The Bars and bags page: the XP and reputation bars, the bags and bank, the menu strip and the quest tracker.
local function barsPageRows()
  return append(append(dataBarRows(), bagRows()), gamePartRows())
end

O.AddPage({ key = "bars", title = "Bars and bags", icon = "NavBars", order = 80, rows = barsPageRows })
