-- The Bars, map, chat page (/vg): your buffs, the XP bars, minimap, chat
-- and bags, the info strip, other addons' feeds, the game's extras,
-- windows and tools, the auction house, merchants, errands, instance
-- prep, chat watch, prompts, tooltips and gear upgrades. Core/Options.lua
-- has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local moduleSettings, setting, liveSetting, check, append = O.ModuleSettings, O.Setting, O.LiveSetting, O.Check, O.Append

-- get/set for the chat text size, which chat windows take at once.
local function chatSizeSetting()
  return liveSetting("Chat", "textSize", function() local CH = ns.GetModule("Chat") if CH.settings then CH.Refresh() end end)
end

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

-- The auction helper's scan, auction check, disenchant, crafting, deals and upgrades rows.
local function auctionScanRows()
  return {
    check("Scan button (one scan every 15 minutes)", setting("AuctionHelper", "scanButton")),
    check("Check your auctions for undercuts again after each post and cancel", setting("AuctionHelper", "recheck")),
    check("Disenchant values in tooltips (on for enchanters until you choose)", ns.AuctionPrices.DisenchantSetting()),
    check("Crafting costs and profit beside the profession window", setting("AuctionHelper", "crafting")),
    check("Deals list in the Lists tab: listings under the 7-day market or vendor price", liveSetting("AuctionHelper", "deals", function() ns.GetModule("AuctionHelper").PaintDeals() end)),
    check("Upgrades list in the Lists tab: armor and weapons that beat what you wear, by Gear upgrades' weights", liveSetting("AuctionHelper", "upgrades", function() ns.GetModule("AuctionHelper").PaintUpgrades() end)),
  }
end

-- The auction helper: its tabs, tooltip prices, the sell card's undercut, length and vendor floor, then the scan rows.
local function auctionRows()
  return append({
    { "header", "Auction house" },
    check("Lists and Posting tabs on the auction house (lists, deals, upgrades, sell helper, your auctions, scan)", setting("AuctionHelper", "panel")),
    check("Auction prices in tooltips (from your scans)", setting("AuctionHelper", "tooltip")),
    { "cycle", "Undercut by", { { "copper", "1 copper" }, { "silver", "1 silver" }, { "percent", "1 %" }, { "match", "Match" } }, setting("AuctionHelper", "undercut") },
    { "cycle", "Auction length", ns.GetModule("AuctionHelper").DurationChoices(true), setting("AuctionHelper", "duration") },
    check("Never post under vendor price", setting("AuctionHelper", "vendorFloor")),
  }, auctionScanRows())
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
    check("Damage meter in the Vanguard look (reload)", setting("GameTools", "meter", true)),
    check("Place them to fit the layout; off leaves them to Edit Mode (reload)", setting("GameTools", "place", true)),
    check("Loss of control in the Vanguard look, above your character (reload)", setting("GameAlerts", "lossOfControl", true)),
    { "cycle", "Talking head (reload)", { { "move", "Vanguard look, top center" }, { "hide", "Hidden" }, { "game", "The game's" } }, setting("GameAlerts", "talkingHead", true) },
    check("Hardcore death notices in the Vanguard look (reload)", setting("GameAlerts", "hardcore", true)),
    check("A rare nearby: a sound and a chat line, out of combat", setting("GameAlerts", "rares")),
  }, glowRows())
end

-- The visibility rows (Core/Visibility.lua) of a module's frame, applied at once
-- (when the module runs); unset, the setting is Always. modes: its choices (V.MODES unless given).
local function visibilityRows(caption, module, modeKey, whenKey, modes)
  local mode, when = ns.Visibility.Rows(caption, function() return moduleSettings(module) end, modeKey, whenKey, function()
    local m = ns.GetModule(module)
    if m.enabled then m.ApplyVisibility() end
  end, "always", modes)
  O.Tag(mode[4], module, modeKey)
  return mode, when
end

-- The game's extras: minimap buttons, the menu strip and the quest tracker (after a reload).
local function gamePartRows()
  local menuVisibility, menuWhen = visibilityRows("Bags and game menu", "MenuStrip", "menu", "menuWhen", ns.Visibility.MENU_MODES)
  return {
    { "header", "The game's extras" },
    check("Tracking, mail and difficulty on the minimap's corners (reload)", setting("Minimap", "icons", true)),
    menuVisibility, menuWhen,
    check("Vanguard icons on the menu buttons (reload)", setting("MenuStrip", "glyphs", true)),
    check("Quest tracker under the info strip (reload)", setting("MenuStrip", "tracker", true)),
    check("Quest tracker in the Vanguard look (reload)", setting("MenuStrip", "trackerLook", true)),
  }
end

-- XP and reputation bars: which, their numbers, and when they're seen.
local function dataBarRows()
  local barsVisibility, barsWhen = visibilityRows("XP and reputation bars", "DataBars", "visibility", "showWhen")
  return {
    { "header", "XP and reputation" },
    check("Experience bar", setting("DataBars", "xp", true)), check("Reputation bar", setting("DataBars", "reputation", true)),
    { "cycle", "Numbers", { { "hover", "on hover" }, { "always", "always" } }, setting("DataBars", "text", true) },
    check("Experience tooltip on hover (kills to level, rested, quest XP)", setting("DataBars", "tooltip")),
    barsVisibility, barsWhen,
  }
end

-- Minimap, chat and bags.
local function moreRows()
  return {
    { "header", "Minimap, chat, bags" },
    check("Coordinates under the minimap", setting("Minimap", "coords", true)), check("Coordinates on the world map (reload)", setting("Waypoints", "mapCoords", true)),
    check("/way sets map waypoints, unless another addon has it (reload)", setting("Waypoints", "slash", true)),
    check("Chat background", setting("Chat", "background", true)), check("Keep chat in its bottom-left spot (reload)", setting("Chat", "place", true)),
    { "cycle", "Chat text size (follows Text size)", ns.GetModule("Chat").SIZES, chatSizeSetting() },
    check("Combined bag (reload)", setting("Bags", "combined", true)), check("Bank in the Vanguard look (reload)", setting("Bags", "bank", true)),
  }
end

-- The combined bag's sections, laid out (or back to the plain grid) at once.
local function bagRows()
  return { check("Combined bag in sections: equipment, consumables, quest items, junk",
    liveSetting("Bags", "sections", function() ns.GetModule("Bags").SectionsChanged() end)) }
end

-- get/set for the weapon enchant cells, which show or hide at once.
local function enchantSetting()
  return liveSetting("PlayerAuras", "enchants", function() ns.GetModule("PlayerAuras").UpdateEnchants() end)
end

-- Your own buffs and debuffs (by the minimap).
local function playerAuraRows()
  return {
    { "header", "Your buffs and debuffs" },
    check("Timer numbers on your buffs (reload)", setting("PlayerAuras", "timers", true)),
    check("Weapon enchants in front of your buffs", enchantSetting()),
    { "cycle", "Icon size (reload)", { { 26, "Small" }, { 30, "Medium" }, { 36, "Large" } }, setting("PlayerAuras", "size", true) },
  }
end

-- get/set for one info strip block, which shows or hides at once.
local function stripSetting(key)
  return liveSetting("InfoStrip", key, function() ns.GetModule("InfoStrip").UpdateAll() end)
end

-- Fight history under the damage meter: its switch (applied at once) and its visibility.
local function fightRows()
  local FH = ns.GetModule("FightHistory")
  local fightVisibility, fightWhen = visibilityRows("Fight history visibility", "FightHistory", "visibility", "showWhen")
  return {
    { "header", "Fight history" },
    check("Sparkline of your DPS in the last 20 fights, under the damage meter", liveSetting("FightHistory", "strip", function() if FH.enabled then FH.Paint() end end)),
    check("Recap in chat after each fight: interrupts, dispels, damage taken, deaths (/vg recap)", setting("FightHistory", "recap")),
    fightVisibility, fightWhen,
  }
end

-- The roll tracker: its switches (applied at once) and its visibility.
local function rollRows()
  local R = ns.GetModule("Rolls")
  local rollVisibility, rollWhen = visibilityRows("Roll tracker visibility", "Rolls", "visibility", "showWhen")
  -- Draws the panel again (when the module is on).
  local function paint() if R.enabled then R.Paint() end end
  return {
    { "header", "Roll tracker" },
    check("Show the group's /roll results in a small panel", liveSetting("Rolls", "show", paint)),
    check("Show loot rolls (who rolled what) where the client has them", liveSetting("Rolls", "loot", function() if R.enabled then R.ReadLoot() end end)),
    rollVisibility, rollWhen,
  }
end

-- The craft queue: its switch (off until switched on) and the pace the per-hour ranking assumes.
local function craftRows()
  return {
    { "header", "Craft queue" },
    check("Craft queue, profession cooldowns and recipe ranking (/vg craft)", setting("CraftQueue", "on")),
    { "slider", "Seconds a craft takes, for the per-hour ranking", { min = 1, max = 60, step = 1 }, setting("CraftQueue", "secs") },
  }
end

-- The mail tools: their one switch (off until switched on).
local function mailRows()
  return {
    { "header", "Mail tools" },
    check("Search the inbox and send-to-alt presets beside the mail window (/vg mail)", liveSetting("MailTools", "on", function() ns.GetModule("MailTools").Paint() end)),
  }
end

-- The info strip's auction sales (the sales ledger, Modules/AuctionLedger.lua): off until switched on.
local function ledgerRows()
  return { check("Your auction sales this session", stripSetting("ahgold")) }
end

-- The info strip under the minimap: one switch per block, then Fight history.
local function stripRows()
  local stripVisibility, stripWhen = visibilityRows("Strip visibility", "InfoStrip", "visibility", "showWhen")
  return append({
    { "header", "Strip under the minimap" }, stripVisibility, stripWhen,
    check("Durability", stripSetting("durability")), check("Free bag slots", stripSetting("bags")),
    check("Frame rate and latency", stripSetting("system")), check("Gold", stripSetting("gold")),
    check("Ammo (hunters, warriors, rogues)", stripSetting("ammo")), check("Clock", stripSetting("clock")), check("Day, date and calendar button", stripSetting("date")),
    check("Soul shards (warlocks)", stripSetting("shards")), check("XP per hour this session", stripSetting("xprate")),
    check("Time to the next level", stripSetting("leveltime")), check("Gold per hour this session", stripSetting("goldrate")),
    check("Your DPS in the last fight (from the game's damage meter)", stripSetting("dps")), check("Your place in the last fight's DPS, in a group", stripSetting("rank")),
  }, append(ledgerRows(), append(fightRows(), append(rollRows(), append(craftRows(), mailRows())))))
end

-- At a merchant, and the error line.
local function merchantRows()
  return {
    { "header", "Merchants and errors" },
    check("Repair with your own gold at a merchant", setting("Merchant", "repair")),
    check("Sell gray items at a merchant", setting("Merchant", "junk")),
    check("Hide errors the action bar already shows (reload)", setting("Merchant", "errors", true)),
  }
end

-- The game's class-colored names in chat: always, never, or as each chat type is set.
local CLASS_NAMES = { { "0", "Always" }, { "1", "Never" }, { "2", "As each chat type is set" } }
-- chatClassColorOverride: "0" and "1" force class colors on or off; anything else leaves them to each chat type.
local function classNameChoice(v) return (v == "0" or v == "1") and v or "2" end
-- showTimestamps: "none" (or unset) is off, anything else a time format.
local function timestampChoice(v) return v or "none" end

-- Chat: the extras, and the game's own timestamp and class-color settings.
local function chatRows()
  local CX = ns.GetModule("ChatExtras")
  return {
    { "header", "Chat" },
    check("Clickable web links in chat (reload)", setting("ChatExtras", "links", true)),
    check("Copy button over the chat (reload)", setting("ChatExtras", "copy", true)),
    check("Short channel names: [2. Trade] shows as [T]", setting("ChatExtras", "shortChannels")),
    check("Ctrl + mouse wheel jumps to the top or bottom of chat", setting("ChatExtras", "ctrlScroll")),
    { "cycle", "Chat timestamps (the game's setting)", CX.TimestampChoices(), CX.CVarSetting("showTimestamps", timestampChoice) },
    { "cycle", "Class-colored names in chat (the game's setting)", CLASS_NAMES, CX.CVarSetting("chatClassColorOverride", classNameChoice) },
  }
end

-- Chat watch's switches: the channels it reads, its sound, its toast and the toast's auction price.
local function chatWatchSwitches(CW)
  return {
    check("Numbered channels (General, Trade, LFG)", CW.ChannelSetting("channel")),
    check("Say", CW.ChannelSetting("say")), check("Yell", CW.ChannelSetting("yell")), check("Guild", CW.ChannelSetting("guild")),
    check("Party and raid", CW.ChannelSetting("party", "raid")), check("Whispers", CW.ChannelSetting("whisper")),
    check("Sound", setting("ChatWatch", "sound")), check("Toast", setting("ChatWatch", "toast")),
    check("Auction price of a linked item on the toast", setting("ChatWatch", "prices")),
  }
end

-- Chat watch: add a phrase, a Remove button per phrase, then the switches.
local function chatWatchRows()
  local CW = ns.GetModule("ChatWatch")
  local rows = { { "header", "Chat watch" }, { "text", "Phrases to watch for: a sound and a toast when one is said; click the toast to whisper." },
    { "button", "Add a phrase", function() ns.AskText("Watch for", CW.AddFromDialog, "Add") end } }
  for _, p in ipairs(moduleSettings("ChatWatch").phrases) do rows[#rows + 1] = { "button", "Remove: " .. p, function() CW.Remove(p) end } end
  return append(rows, chatWatchSwitches(CW))
end

-- The minimap drawer and the auto-accept switches.
local function comfortRows()
  return {
    { "header", "Minimap and prompts" },
    check("Gather addon minimap buttons into a drawer (reload)", setting("MinimapButtons", "drawer", true)),
    check("Accept summons (out of combat)", setting("AutoAccept", "summons")),
    check("Accept resurrections", setting("AutoAccept", "resurrect")), check("Decline duels", setting("AutoAccept", "duels")),
    check("Faster auto-loot (when the game's auto-loot is on)", setting("AutoAccept", "loot")),
  }
end

-- Errands: training, stocking up and flight times.
local function errandRows()
  return {
    { "header", "Errands" },
    check("Train all button at trainers", setting("Errands", "trainAll")),
    check("Keep items stocked from merchants (/vg stock)", setting("Errands", "stock")),
    check("Flight timer (reload)", setting("Errands", "flightTimer", true)),
    check("Boat and zeppelin timer (reload)", setting("Errands", "boatTimer", true)),
  }
end

-- The Legacy perk planner: its switch (/vg legacy plan).
local function legacyRows()
  return {
    { "header", "Legacy" },
    check("Legacy perk planner: a list of perks within the tree's 16 points (/vg legacy plan)", setting("Legacy", "planner")),
  }
end

-- Vendor memory: where items are sold, in their tooltips.
local function vendorRows()
  return {
    check("Where an item is sold (merchants you've visited)", setting("VendorMemory", "tooltip")),
    check("Remember what merchants sell", setting("VendorMemory", "remember")),
  }
end

-- Spell ranks: the bar notice and trainer memory, both off until switched on.
local function spellRankRows()
  return {
    { "header", "Spell ranks" },
    check("Notice older spell ranks on bar buttons (/vg ranks)", setting("SpellRanks", "barNotice")),
    check("Remember what trainers teach (/vg trainers)", setting("SpellRanks", "trainerMemory")),
  }
end

-- Instance prep's sliders: how long the card stays (seconds), and the durability warning (percent).
local PREP_SECONDS = { min = 5, max = 60, step = 5, format = function(v) return string.format("%d s", v) end }
local PREP_PERCENT = { min = 10, max = 90, step = 5, format = function(v) return string.format("%d%%", v) end }

-- Instance prep's dungeon card and buff checks (flask, food, oil or poison, raid buffs; world buffs), and the note on wanted amounts.
local function prepBuffRows()
  return {
    check("Dungeon card: level range, your dungeon quests and keys on the checklist", setting("InstancePrep", "dungeonCard")),
    check("Buff checks on the card: flask, food, oil or poison, raid buffs", setting("InstancePrep", "buffs")),
    check("World buffs among them", setting("InstancePrep", "worldBuffs")),
    { "text", "Wanted amounts: /vg prep want <food|bandages|potions|ammo|shards> <n>; items from /vg stock are checked too." },
  }
end

-- Instance prep: when the checklist card shows, how long it stays, and the durability warning.
local function prepRows()
  local rows = {
    { "header", "Instance prep" },
    check("Checklist when you enter a dungeon or raid (only when something is low)", setting("InstancePrep", "onEnter")),
    check("Checklist on a ready check", setting("InstancePrep", "onReadyCheck")),
    check("Warn in chat when a supply runs low (once, out of combat)", setting("InstancePrep", "lowWarn")),
    { "slider", "Hide after", PREP_SECONDS, setting("InstancePrep", "hideAfter") },
    { "slider", "Durability warning under", PREP_PERCENT, setting("InstancePrep", "durability") },
  }
  for _, r in ipairs(prepBuffRows()) do rows[#rows + 1] = r end
  return rows
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

-- Gear upgrades: the role the weights are for, and where upgrades show.
local function upgradeRows()
  local roles = { { "auto", "group role, else damage" }, { "damage", "damage" }, { "tank", "tank" }, { "healer", "healer" } }
  return {
    { "header", "Gear upgrades" },
    { "cycle", "Weigh stats for", roles, liveSetting("Upgrades", "role", function() ns.GetModule("Upgrades").Changed() end) },
    check("Upgrade or downgrade on item tooltips", setting("Upgrades", "tooltip")),
    check("Arrow on upgrades in the combined bag", setting("Upgrades", "bags")), check("Arrow on quest rewards that are upgrades", setting("Upgrades", "quests")),
    { "text", "/vg weights shows the stat weights in use; set <stat> <n>, reset, export and import change or share them." },
  }
end

-- Boss mods: a button to line their bars up with Vanguard's spots, only while one is loaded.
local function bossDockRows()
  local BD = ns.GetModule("BossDocks")
  if not (BD.HasDBM() or BD.HasBigWigs()) then return {} end
  return { { "header", "Boss mods" }, { "button", "Line up boss mod bars with the Boss timers spots", BD.Command },
    { "text", "Move the Boss timers spots with /vg unlock first. Deadly Boss Mods' bars move at once; for BigWigs, chat says where to drag them." } }
end

-- Other addons' data feeds for the broker strip: one switch per feed, while any addon shares one.
local function brokerRows()
  local BS = ns.GetModule("BrokerStrip")
  local sources, rows = BS.Sources(), { { "header", "Data from other addons" } }
  if #sources == 0 then return { rows[1], { "text", "No addon shares data through LibDataBroker right now." } } end
  rows[2] = { "text", "Picked feeds show in the broker strip along the top edge (up to " .. BS.MAX .. ", in the order picked)." }
  for _, name in ipairs(sources) do rows[#rows + 1] = check(name, function() return BS.Chosen(name) end, function(v) BS.Choose(name, v) end) end
  return rows
end

-- The Bars, map, chat page: your buffs, bars and map, the strip, merchants, tooltips.
local function morePageRows()
  local rows = append(append(append(playerAuraRows(), dataBarRows()), moreRows()), bagRows())
  append(append(rows, stripRows()), brokerRows())
  append(rows, gamePartRows())
  append(rows, windowRows())
  append(rows, auctionRows())
  append(append(rows, gameToolRows()), bossDockRows())
  append(rows, merchantRows())
  append(append(append(append(rows, errandRows()), spellRankRows()), legacyRows()), prepRows())
  append(append(append(rows, chatRows()), chatWatchRows()), comfortRows())
  return append(append(rows, tooltipRows()), upgradeRows())
end

O.AddPage({ key = "more", title = "Bars, map, chat", icon = "NavMap", order = 80, rows = function() return morePageRows() end })
