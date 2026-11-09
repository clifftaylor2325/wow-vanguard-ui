-- The Game windows page (/vg): the game's windows in the Vanguard look,
-- auto-accept and tooltips. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, check, append = O.Setting, O.ReloadSetting, O.Check, O.Append

-- The game's own windows in the Vanguard look, by group: setting key -> its switch's label.
local WINDOW_GROUPS = {
  { "windows", L["Character and other windows (reload)"] },
  { "popups", L["Popups (reload)"] },
  { "timers", L["Breath and fatigue bars (reload)"] },
  { "durability", L["Durability on the character pane's gear (reload)"] },
  { "social", L["Mail, guild and social windows (reload)"] },
  { "town", L["Town windows and item dialogs (reload)"] },
  { "system", L["Options and help windows (reload)"] },
  { "map", L["World map and calendar windows (reload)"] },
  { "menus", L["Menus, dropdowns and tooltips (reload)"] },
  { "tabs", L["Tabs and the character pane (reload)"] },
  { "pvp", L["Battleground windows (reload)"] },
  { "movable", L["Drag game windows by their title bar (reload)"] },
}

-- The rows functions added to the Game windows card with ns.RetailRows, in the order they came.
local addedWindowRows = {}

-- Adds rows to the Game windows card, under the game window switches: a Retail* file (loaded on Retail only)
-- puts the switches of the windows it dresses there without this file changing. rowsFn() runs each time the
-- page is built. RetailWindows, RetailVault and RetailLanding add theirs on Retail; Forever adds none.
---@param rowsFn fun(): table[]
function ns.RetailRows(rowsFn)
  addedWindowRows[#addedWindowRows + 1] = rowsFn
end

-- Puts dragged game windows back where the game puts them, open ones too, and the options window in the middle at
-- once; in a fight the game's windows wait until it ends (their layout isn't allowed in one), and chat says so.
local function resetWindowPlaces()
  local forgot = ns.GetModule("Windows").ResetMoves()
  O.PlaceWindow()
  if forgot > 0 and ns.InCombat() then ns.Chat(L["Moved windows go back once the fight ends."]) end
end

-- The game's own windows in the Vanguard look (after a reload): one switch per group, dragging them by
-- their title bar, the rows added with ns.RetailRows, and a button that puts them back where the game places them.
local function windowRows()
  local rows = { { "header", L["Game windows"] } }
  for _, g in ipairs(WINDOW_GROUPS) do rows[#rows + 1] = check(g[2], reloadSetting("Windows", g[1])) end
  for _, rowsFn in ipairs(addedWindowRows) do append(rows, rowsFn()) end
  rows[#rows + 1] = { "button", L["Reset window positions"], resetWindowPlaces }
  return rows
end

-- Auto-accept: summons, resurrections and faster auto-loot.
local function promptRows()
  return {
    { "header", L["Auto-accept"] },
    check(L["Accept summons"], setting("AutoAccept", "summons")),
    check(L["Accept resurrections"], setting("AutoAccept", "resurrect")),
    check(L["Faster auto-loot"], setting("AutoAccept", "loot")),
  }
end

-- Quiet the game, its first part: declined duels and invites, and release in battlegrounds. The card shows the
-- duels, guild invites, error line and zone names; the rest fold under More settings (it would open on nine rows).
local function quietInviteRows()
  return {
    { "header", L["Quiet the game"] },
    O.Essential(check(L["Decline duels"], setting("Quiet", "duels"))),
    O.Essential(check(L["Decline guild invites"], setting("Quiet", "guildInvites"))),
    check(L["Decline group invites from strangers"], setting("Quiet", "strangerGroups")),
    check(L["Decline Battle.net friend requests"], setting("Quiet", "friendRequests")),
    check(L["Release at once in battlegrounds"], setting("Quiet", "pvpRelease")),
  }
end

-- Quiet the game, its second part: the error line (all of it, or what the action bar already shows), the zone
-- names, and a further camera.
local function quietScreenRows()
  return {
    O.Essential(check(L["Hide the red error line"], setting("Quiet", "errors"))),
    check(L["Hide errors the action bar already shows (reload)"], reloadSetting("Quiet", "barErrors")),
    O.Essential(check(L["Hide the zone names that fade in"], setting("Quiet", "zoneText"))),
    -- The setter must stay the row's last element: liveSetting returns a getter and a setter.
    { "cycle", L["Furthest camera zoom (the game's setting)"], ns.GetModule("Quiet").CAMERA,
      O.LiveMethod("Quiet", "camera", "ApplyCamera") },
  }
end

-- Quiet the game: declined invites, release in battlegrounds, hidden HUD text, a further camera.
local function quietRows()
  return append(quietInviteRows(), quietScreenRows())
end

-- Vendor memory: where items are sold, in their tooltips.
local function vendorRows()
  return {
    check(L["Where an item is sold"], setting("VendorMemory", "tooltip")),
    check(L["Remember what merchants sell"], setting("VendorMemory", "remember")),
  }
end

-- Tooltips on units: the border, who a unit targets, and what a player's tooltip adds. The card shows the first
-- three; the rest fold under More settings, as do the last item rows (the card would open on fourteen rows).
local function tooltipUnitRows()
  return {
    O.Essential(check(L["Border in the unit's class color"], setting("Tooltips", "classBorder"))),
    O.Essential(check(L["Show who the unit is targeting"], setting("Tooltips", "targetLine"))),
    O.Essential(check(L["Guild and rank"], setting("Tooltips", "guild"))),
    check(L["Realm, for players of another realm"], setting("Tooltips", "realm")),
    check(L["Group role"], setting("Tooltips", "role")),
    check(L["Your own item level"], setting("Tooltips", "itemLevel")),
    O.Essential(check(L["Hide unit tooltips in combat"], setting("Tooltips", "hideInCombat"))),
  }
end

-- Tooltips on items: the sell price, how many you have (and your other characters), IDs, and where an item is sold.
local function tooltipItemRows()
  local rows = {
    O.Essential(check(L["Item sell price"], setting("Tooltips", "sellPrice"))),
    O.Essential(check(L["How many of an item you have"], setting("Tooltips", "itemCount"))),
    O.Essential(check(L["Counts on your other characters"], setting("Inventory", "alts"))),
    check(L["Item IDs"], setting("Tooltips", "itemID")),
  }
  for _, row in ipairs(vendorRows()) do rows[#rows + 1] = O.Essential(row) end
  return rows
end

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  local rows = {
    { "header", L["Tooltips"] },
    O.Essential({ "cycle", L["Tooltip position"], { { "corner", L["corner (movable)"] }, { "cursor", L["at the cursor"] }, { "default", L["client default"] } }, setting("Tooltips", "anchor") }),
  }
  return append(append(rows, tooltipUnitRows()), tooltipItemRows())
end

-- Your characters: level, money, rested XP and time played of each one remembered here (Modules/Inventory.lua).
local function altRows()
  local rows = { { "header", L["Your characters"] } }
  for _, line in ipairs(ns.GetModule("Inventory").AltLines()) do rows[#rows + 1] = { "text", line } end
  rows[#rows + 1] = { "text", L["Read at login, as your bags change and at logout; the bank while it's open. /vg alts <name> lists one character's items."], "note" }
  return rows
end

-- The Game windows page: the game's windows, prompts and tooltips, then your characters.
local function windowsPageRows()
  return append(append(append(append(windowRows(), promptRows()), quietRows()), tooltipRows()), altRows())
end

O.AddPage({ key = "windows", title = L["Game windows"], icon = "NavWindows", order = 83, rows = windowsPageRows })
