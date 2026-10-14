-- The Town and gear page (/vg): the auction house, merchants and errands,
-- the craft queue and mail tools, spell ranks, Legacy, instance prep and
-- gear upgrades. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local O = ns.Options
local setting, liveSetting, check, append = O.Setting, O.LiveSetting, O.Check, O.Append

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

-- At a merchant, and the error line.
local function merchantRows()
  return {
    { "header", "Merchants and errors" },
    check("Repair with your own gold at a merchant", setting("Merchant", "repair")),
    check("Sell gray items at a merchant", setting("Merchant", "junk")),
    check("Hide errors the action bar already shows (reload)", setting("Merchant", "errors", true)),
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

-- Spell ranks: the bar notice and trainer memory, both off until switched on.
local function spellRankRows()
  return {
    { "header", "Spell ranks" },
    check("Notice older spell ranks on bar buttons (/vg ranks)", setting("SpellRanks", "barNotice")),
    check("Remember what trainers teach (/vg trainers)", setting("SpellRanks", "trainerMemory")),
  }
end

-- The Legacy perk planner: its switch (/vg legacy plan).
local function legacyRows()
  return {
    { "header", "Legacy" },
    check("Legacy perk planner: a list of perks within the tree's 16 points (/vg legacy plan)", setting("Legacy", "planner")),
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
    { "button", "Set wanted amounts...", function() ns.GetModule("InstancePrep").Wizard.Open() end, function() return ns.GetModule("InstancePrep").settings ~= nil end },
    { "text", "Wanted amounts (food, bandages, potions, ammo, shards) are set in the window above or with /vg prep want <kind> <n>; items from /vg stock are checked too." },
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

-- Gear upgrades: the role the weights are for, and where upgrades show.
local function upgradeRows()
  local roles = { { "auto", "group role, else damage" }, { "damage", "damage" }, { "tank", "tank" }, { "healer", "healer" } }
  return {
    { "header", "Gear upgrades" },
    { "cycle", "Weigh stats for", roles, liveSetting("Upgrades", "role", function() ns.GetModule("Upgrades").Changed() end) },
    check("Upgrade or downgrade on item tooltips", setting("Upgrades", "tooltip")),
    check("Arrow on upgrades in the combined bag", setting("Upgrades", "bags")), check("Arrow on quest rewards that are upgrades", setting("Upgrades", "quests")),
    { "button", "Set up stat weights", function() O.Hide(); ns.GetModule("Upgrades").Wizard.Open() end },
    { "text", "/vg weights shows the stat weights in use; wizard, set <stat> <n>, reset, export and import change or share them." },
  }
end

-- The Town and gear page: the auction house, merchants, errands, crafting, mail, spells, Legacy, instance prep and gear upgrades.
local function townPageRows()
  local rows = append(append(auctionRows(), merchantRows()), errandRows())
  append(append(append(rows, craftRows()), mailRows()), spellRankRows())
  return append(append(append(rows, legacyRows()), prepRows()), upgradeRows())
end

O.AddPage({ key = "town", title = "Town and gear", icon = "NavTown", order = 85, rows = townPageRows })
