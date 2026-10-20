-- The Bars and bags page (/vg): the XP and reputation bars, the bags and
-- bank, the menu strip and the quest tracker. Core/Options.lua has the
-- helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, reloadSetting, liveSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveSetting, O.LiveMethod, O.Check, O.Append

-- XP and reputation bars: which, their numbers, and when they're seen.
local function dataBarRows()
  local barsVisibility, barsWhen = O.VisibilityRows("XP and reputation bars", "DataBars", "visibility", "showWhen")
  return {
    { "header", "XP and reputation" },
    check("Experience bar", reloadSetting("DataBars", "xp")), check("Reputation bar", reloadSetting("DataBars", "reputation")),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, reloadSetting("DataBars", "text") },
    check("Tooltips on hover (XP: kills to level, rested, quest XP; reputation: standing and the next)", setting("DataBars", "tooltip")),
    barsVisibility, barsWhen,
  }
end

-- Bags: the combined bag, the game's bank look and the sections.
local function bagRows()
  return {
    { "header", "Bags" },
    check("Combined bag (reload)", reloadSetting("Bags", "combined")), check("Bank in the Vanguard look (reload)", reloadSetting("Bags", "bank")),
    check("Combined bag in sections: equipment, consumables, quest items, junk",
      liveMethod("Bags", "sections", "SectionsChanged")),
  }
end

-- The game's extras: the menu strip and the quest tracker (after a reload).
local function gamePartRows()
  local menuVisibility, menuWhen = O.VisibilityRows("Bags and game menu", "MenuStrip", "menu", "menuWhen", ns.Visibility.MENU_MODES)
  return {
    { "header", "The game's extras" },
    menuVisibility, menuWhen,
    check("Vanguard icons on the menu buttons (reload)", reloadSetting("MenuStrip", "glyphs")),
    check("The game's quest tracker under the info strip (reload)", reloadSetting("MenuStrip", "tracker")),
    check("The game's quest tracker in the Vanguard look (reload)", reloadSetting("MenuStrip", "trackerLook")),
  }
end

-- The Bars and bags page: the XP and reputation bars, the bags and bank, the menu strip and the quest tracker.
local function barsPageRows()
  return append(append(dataBarRows(), bagRows()), gamePartRows())
end

O.AddPage({ key = "bars", title = "Bars and bags", icon = "NavBars", order = 80, rows = barsPageRows })
