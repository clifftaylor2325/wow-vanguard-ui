-- The Game windows page (/vg): the game's windows in the Vanguard look,
-- auto-accept and tooltips. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, check, append = O.Setting, O.Check, O.Append

-- The game's own windows in the Vanguard look, by group: setting key -> its switch's label.
local WINDOW_GROUPS = {
  { "windows", "Character, merchant, quest, loot and other windows (reload)" },
  { "popups", "Popups (reload)" },
  { "timers", "Breath and fatigue bars (reload)" },
  { "durability", "Durability on the character pane's gear (reload)" },
  { "social", "Mail, guild, channels, friends and guild-creation windows (reload)" },
  { "town", "Stable, trainer, merchant, bags, loot and item dialogs (reload)" },
  { "system", "Game options, Edit Mode, keybinding and help windows (reload)" },
  { "map", "World map, group finder, calendar and Legacy windows (reload)" },
  { "menus", "Right-click menus, dropdowns and more tooltips (reload)" },
  { "tabs", "Tab buttons and the inside of the character pane (reload)" },
  { "pvp", "Battleground windows (reload)" },
  { "movable", "Drag game windows by their title bar (reload)" },
}

-- Puts dragged game windows back where the game puts them, open ones too, and the options window in the middle;
-- in a fight all of it waits until the fight ends (the game's window layout isn't allowed in one), and says so.
local function resetWindowPlaces()
  if ns.InCombat() then ns.Chat("Moved windows go back once the fight ends.") end
  ns.OutOfCombat(function()
    ns.GetModule("Windows").ResetMoves()
    O.PlaceWindow()
  end, "reset window places")
end

-- The game's own windows in the Vanguard look (after a reload): one switch per group, dragging them by
-- their title bar, and a button that puts them back where the game places them.
local function windowRows()
  local rows = { { "header", "Game windows" } }
  for _, g in ipairs(WINDOW_GROUPS) do rows[#rows + 1] = check(g[2], setting("Windows", g[1], true)) end
  rows[#rows + 1] = { "button", "Reset window positions", resetWindowPlaces }
  return rows
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

-- Quiet the game: declined invites, hidden HUD text, a further camera, release in battlegrounds.
local function quietRows()
  return {
    { "header", "Quiet the game" },
    check("Decline guild invites", setting("AutoAccept", "guildInvites")),
    check("Decline group invites from people who aren't friends or guildmates", setting("AutoAccept", "strangerGroups")),
    check("Decline Battle.net friend requests", setting("AutoAccept", "friendRequests")),
    check("Release at once when you die in a battleground", setting("AutoAccept", "pvpRelease")),
    check("Hide the red error line", setting("Quiet", "errors")), check("Hide the zone names that fade in", setting("Quiet", "zoneText")),
    -- The setter must stay the row's last element: liveSetting returns a getter and a setter.
    { "cycle", "Furthest the camera zooms out", ns.GetModule("Quiet").CAMERA,
      O.LiveSetting("Quiet", "camera", function() ns.GetModule("Quiet").ApplyCamera() end) },
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

-- Your characters: level, money, rested XP and time played of each one remembered here (Modules/Inventory.lua).
local function altRows()
  local rows = { { "header", "Your characters" } }
  for _, line in ipairs(ns.GetModule("Inventory").AltLines()) do rows[#rows + 1] = { "text", line } end
  rows[#rows + 1] = { "text", "Read at login, as your bags change and at logout; the bank while it's open. /vg alts <name> lists one character's items.", "note" }
  return rows
end

-- The Game windows page: the game's windows, prompts and tooltips, then your characters.
local function windowsPageRows()
  return append(append(append(append(windowRows(), promptRows()), quietRows()), tooltipRows()), altRows())
end

O.AddPage({ key = "windows", title = "Game windows", icon = "NavWindows", order = 83, rows = windowsPageRows })
