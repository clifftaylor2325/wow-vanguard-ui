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

-- Auto-accept: summons, resurrections, duels and faster auto-loot.
local function promptRows()
  return {
    { "header", L["Auto-accept"] },
    check(L["Accept summons"], setting("AutoAccept", "summons")),
    check(L["Accept resurrections"], setting("AutoAccept", "resurrect")), check(L["Decline duels"], setting("AutoAccept", "duels")),
    check(L["Faster auto-loot"], setting("AutoAccept", "loot")),
  }
end

-- Quiet the game, its first part: declined invites and release in battlegrounds.
local function quietInviteRows()
  return {
    { "header", L["Quiet the game"] },
    check(L["Decline guild invites"], setting("AutoAccept", "guildInvites")),
    check(L["Decline group invites from strangers"], setting("AutoAccept", "strangerGroups")),
    check(L["Decline Battle.net friend requests"], setting("AutoAccept", "friendRequests")),
    check(L["Release at once in battlegrounds"], setting("AutoAccept", "pvpRelease")),
  }
end

-- Quiet the game, its second part: the error line (all of it, or what the action bar already shows: the
-- Merchant module's filter), the zone names, and a further camera.
local function quietScreenRows()
  return {
    check(L["Hide the red error line"], setting("Quiet", "errors")),
    check(L["Hide errors the action bar already shows (reload)"], reloadSetting("Merchant", "errors")),
    check(L["Hide the zone names that fade in"], setting("Quiet", "zoneText")),
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

-- Tooltips: where they sit and what they add.
local function tooltipRows()
  return append({
    { "header", L["Tooltips"] },
    { "cycle", L["Tooltip position"], { { "corner", L["corner (movable)"] }, { "cursor", L["at the cursor"] }, { "default", L["client default"] } }, setting("Tooltips", "anchor") },
    check(L["Border in the unit's class color"], setting("Tooltips", "classBorder")),
    check(L["Show who the unit is targeting"], setting("Tooltips", "targetLine")),
    check(L["Item sell price"], setting("Tooltips", "sellPrice")),
    check(L["How many of an item you have"], setting("Tooltips", "itemCount")), check(L["Item IDs"], setting("Tooltips", "itemID")),
    check(L["Counts on your other characters"], setting("Inventory", "alts")),
    check(L["Hide unit tooltips in combat"], setting("Tooltips", "hideInCombat")),
  }, vendorRows())
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
