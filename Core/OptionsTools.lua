-- The Windows and tools page (/vg): the game's windows in the Vanguard
-- look, the game's tools, boss mods, fight history, the roll tracker,
-- auto-accept and tooltips. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local moduleSettings, setting, liveSetting, check, append = O.ModuleSettings, O.Setting, O.LiveSetting, O.Check, O.Append

-- The game's own windows in the Vanguard look, by group: setting key -> its switch's label.
local WINDOW_GROUPS = {
  { "windows", "Character, merchant, quest, loot and other windows (reload)" },
  { "popups", "Popups (reload)" },
  { "timers", "Breath and fatigue bars (reload)" },
  { "durability", "Durability on the character pane's gear (reload)" },
  { "social", "Mail, guild, channels, friends and guild-creation windows (reload)" },
  { "town", "Stable, trainer, bags, loot and item dialogs (reload)" },
  { "system", "Game options, Edit Mode, keybinding and help windows (reload)" },
  { "map", "World map, group finder, calendar and Legacy windows (reload)" },
  { "menus", "Right-click menus, dropdowns and more tooltips (reload)" },
  { "tabs", "Tab buttons and the inside of the character pane (reload)" },
  { "pvp", "Battleground windows (reload)" },
  { "movable", "Drag game windows by their title bar (reload)" },
}

-- Forgets where game windows were dragged to (and the options window's place, which goes back to the middle at once).
local function resetWindowPlaces()
  ns.GetModule("Windows").ResetMoves()
  O.PlaceWindow()
end

-- The game's own windows in the Vanguard look (after a reload): one switch per group, dragging them by
-- their title bar, and a button that puts them back where the game places them.
local function windowRows()
  local rows = { { "header", "Game windows" } }
  for _, g in ipairs(WINDOW_GROUPS) do rows[#rows + 1] = check(g[2], setting("Windows", g[1], true)) end
  rows[#rows + 1] = { "button", "Reset window positions", resetWindowPlaces }
  return rows
end

-- get/set for showing the game's Cooldown Manager, which turns it on or off at once.
local function cooldownManagerSetting()
  return liveSetting("GameTools", "essential", function() ns.GetModule("GameTools").SetCooldownManager(moduleSettings("GameTools").essential) end)
end

-- The share of an aura's time left under which the Cooldown Manager's icon glows.
local GLOW_PERCENT = { min = 10, max = 60, step = 5, format = function(v) return string.format("%d%%", v) end }

-- Puts the Cooldown Manager glows right after a change of their switch or share.
local function applyGlow()
  ns.GetModule("CooldownGlow").Apply()
end

-- The Cooldown Manager glow's switch and share (Modules/CooldownGlow.lua), applied at once.
local function glowRows()
  return {
    check("Glow a Cooldown Manager buff in its last part, where the game's own flag is missing", liveSetting("CooldownGlow", "glow", applyGlow)),
    { "slider", "Glow when this much is left", GLOW_PERCENT, liveSetting("CooldownGlow", "percent", applyGlow) },
  }
end

-- The game's own tools: the Cooldown Manager and the damage meter (after a reload).
local function gameToolRows()
  return append({
    { "header", "The game's tools" },
    check("Show the game's Cooldown Manager: its essential row between your frames", cooldownManagerSetting()), check("Cooldown Manager in the Vanguard look (reload)", setting("GameTools", "cooldowns", true)),
    check("Cooldown gaps: a row of icons for trinkets, items and spells you choose (/vg gaps add, /vg gaps spell add), pet abilities and totems (reload)", setting("CooldownGaps", "on", true)), check("Cooldown gaps row also draws the Cooldown Manager's essential and utility cooldowns (reload)", setting("CooldownGaps", "tracked", true)), check("Damage meter in the Vanguard look (reload)", setting("GameTools", "meter", true)),
    check("Place them to fit the layout; off leaves them to Edit Mode (reload)", setting("GameTools", "place", true)),
    check("Loss of control in the Vanguard look, above your character (reload)", setting("GameAlerts", "lossOfControl", true)),
    { "cycle", "Talking head (reload)", { { "move", "Vanguard look, top center" }, { "hide", "Hidden" }, { "game", "The game's" } }, setting("GameAlerts", "talkingHead", true) },
    check("Hardcore death notices in the Vanguard look (reload)", setting("GameAlerts", "hardcore", true)),
    check("A rare nearby: a sound and a chat line, out of combat", setting("GameAlerts", "rares")),
  }, glowRows())
end

-- Boss mods: a button to line their bars up with Vanguard's spots, only while one is loaded.
local function bossDockRows()
  local BD = ns.GetModule("BossDocks")
  if not (BD.HasDBM() or BD.HasBigWigs()) then return {} end
  return { { "header", "Boss mods" }, { "button", "Line up boss mod bars with the Boss timers spots", BD.Command },
    { "text", "Move the Boss timers spots with /vg unlock first. Deadly Boss Mods' bars move at once; for BigWigs, chat says where to drag them." } }
end

-- Fight history under the damage meter: its switch (applied at once) and its visibility.
local function fightRows()
  local FH = ns.GetModule("FightHistory")
  local fightVisibility, fightWhen = O.VisibilityRows("Fight history visibility", "FightHistory", "visibility", "showWhen")
  return {
    { "header", "Fight history" },
    check("Sparkline of your DPS in the last 20 fights, under the damage meter", liveSetting("FightHistory", "strip", function() if FH.enabled then FH.Paint() end end)),
    check("Recap in chat after each fight: interrupts, dispels, damage taken, deaths (/vg recap)", setting("FightHistory", "recap")),
    fightVisibility, fightWhen,
  }
end

-- Vanguard's own damage and healing meter: its switches (applied at once) and its visibility.
local function meterRows()
  local MT = ns.GetModule("Meter")
  local meterVisibility, meterWhen = O.VisibilityRows("Vanguard meter visibility", "Meter", "visibility", "showWhen")
  -- Draws the panel again, building it first when it was just switched on (when the module is on).
  local function paint() if MT.enabled then MT.Refresh() end end
  return {
    { "header", "Vanguard meter" },
    check("Vanguard's own damage and healing meter: the top lines of the game's meter (/vg meter)", liveSetting("Meter", "on", paint)),
    { "cycle", "Meter shows", { { "Dps", "Damage per second" }, { "Hps", "Healing per second" } }, liveSetting("Meter", "kind", paint) },
    { "slider", "Lines in the meter", { min = 3, max = MT.MAXROWS, step = 1 }, liveSetting("Meter", "rows", paint) },
    meterVisibility, meterWhen,
  }
end

-- The roll tracker: its switches (applied at once) and its visibility.
local function rollRows()
  local R = ns.GetModule("Rolls")
  local rollVisibility, rollWhen = O.VisibilityRows("Roll tracker visibility", "Rolls", "visibility", "showWhen")
  -- Draws the panel again (when the module is on).
  local function paint() if R.enabled then R.Paint() end end
  return {
    { "header", "Roll tracker" },
    check("Show the group's /roll results in a small panel", liveSetting("Rolls", "show", paint)),
    check("Show loot rolls (who rolled what) where the client has them", liveSetting("Rolls", "loot", function() if R.enabled then R.ReadLoot() end end)),
    rollVisibility, rollWhen,
  }
end

-- Auto-accept: summons, resurrections, duels and faster auto-loot.
local function promptRows()
  return {
    { "header", "Prompts" },
    check("Accept summons (out of combat)", setting("AutoAccept", "summons")),
    check("Accept resurrections", setting("AutoAccept", "resurrect")), check("Decline duels", setting("AutoAccept", "duels")),
    check("Faster auto-loot (when the game's auto-loot is on)", setting("AutoAccept", "loot")),
  }
end

-- Vendor memory: where items are sold, in their tooltips.
local function vendorRows()
  return {
    check("Where an item is sold (merchants you've visited)", setting("VendorMemory", "tooltip")),
    check("Remember what merchants sell", setting("VendorMemory", "remember")),
  }
end

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  return append({
    { "header", "Tooltips" },
    { "cycle", "Tooltip position", { { "corner", "corner (movable)" }, { "cursor", "at the cursor" }, { "default", "client default" } }, setting("Tooltips", "anchor") },
    check("Border in the unit's class color", setting("Tooltips", "classBorder")),
    check("Show who the unit is targeting", setting("Tooltips", "targetLine")),
    check("What an item sells for (when the game doesn't say)", setting("Tooltips", "sellPrice")),
    check("How many of an item you have", setting("Tooltips", "itemCount")), check("Item IDs", setting("Tooltips", "itemID")),
    check("How many your other characters have (here, same side)", setting("Inventory", "alts")),
    check("Hide unit tooltips in combat", setting("Tooltips", "hideInCombat")),
  }, vendorRows())
end

-- The Windows and tools page: the game's windows and tools, boss mods, the fight panels, prompts and tooltips.
local function toolsPageRows()
  local rows = append(append(windowRows(), gameToolRows()), bossDockRows())
  return append(append(append(append(append(rows, fightRows()), meterRows()), rollRows()), promptRows()), tooltipRows())
end

O.AddPage({ key = "tools", title = "Windows and tools", icon = "NavTools", order = 83, rows = toolsPageRows })
