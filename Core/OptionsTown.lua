-- The Town and gear page (/vg): the auction house, merchants and errands,
-- the craft queue and mail tools, spell ranks, Legacy, instance prep and
-- gear upgrades. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveMethod, O.Check, O.Append

-- The auction helper's scan, auction check, disenchant, crafting, deals and upgrades rows.
local function auctionScanRows()
  return {
    check(L["Scan button (one scan every 15 minutes)"], setting("AuctionHelper", "scanButton")),
    check(L["Check your auctions for undercuts again after each post and cancel"], setting("AuctionHelper", "recheck")),
    check(L["Disenchant values in tooltips (on for enchanters until you choose)"], ns.AuctionPrices.DisenchantSetting()),
    check(L["Crafting costs and profit beside the profession window"], setting("AuctionHelper", "crafting")),
    check(L["Deals list in the Lists tab: listings under the 7-day market or vendor price"], liveMethod("AuctionHelper", "deals", "PaintDeals")),
    check(L["Upgrades list in the Lists tab: armor and weapons that beat what you wear, by Gear upgrades' weights"], liveMethod("AuctionHelper", "upgrades", "PaintUpgrades")),
  }
end

-- The auction helper: its tabs, tooltip prices, the sell card's undercut, length and vendor floor, then the scan rows.
local function auctionRows()
  return append({
    { "header", L["Auction house"] },
    check(L["Lists and Posting tabs on the auction house (lists, deals, upgrades, sell helper, your auctions, scan)"], setting("AuctionHelper", "panel")),
    check(L["Auction prices in tooltips (from your scans)"], setting("AuctionHelper", "tooltip")),
    { "cycle", L["Undercut by"], { { "copper", L["1 copper"] }, { "silver", L["1 silver"] }, { "percent", "1 %" }, { "match", L["Match"] } }, setting("AuctionHelper", "undercut") },
    { "cycle", L["Auction length"], ns.GetModule("AuctionHelper").DurationSettingChoices(), setting("AuctionHelper", "duration") },
    check(L["Never post under vendor price"], setting("AuctionHelper", "vendorFloor")),
  }, auctionScanRows())
end

-- At a merchant (the error line's switch is under Game windows, Quiet the game).
local function merchantRows()
  return {
    { "header", L["Merchants"] },
    check(L["Repair with your own gold at a merchant"], setting("Merchant", "repair")),
    check(L["Sell gray items at a merchant"], setting("Merchant", "junk")),
    check(L["Offer to sell the items on your sell list (/vg junk)"], setting("Merchant", "listSell")),
    check(L["Stack and Max buttons on a merchant item's quantity window"], setting("Merchant", "bulkBuy")),
  }
end

-- Errands: training, stocking up and flight times.
local function errandRows()
  return {
    { "header", L["Errands"] },
    check(L["Train all button at trainers"], setting("Errands", "trainAll")),
    check(L["Keep items stocked from merchants (/vg stock)"], setting("Errands", "stock")),
    { "button", L["Edit list..."], function() ns.GetModule("Errands").StockWindow.Open() end, function() return ns.GetModule("Errands").settings ~= nil end },
    check(L["Flight timer (reload)"], reloadSetting("Errands", "flightTimer")),
    check(L["Boat and zeppelin timer (reload)"], reloadSetting("Errands", "boatTimer")),
  }
end

-- The craft queue: its switch (off until switched on) and the pace the per-hour ranking assumes.
local function craftRows()
  return {
    { "header", L["Craft queue"] },
    check(L["Craft queue, profession cooldowns and recipe ranking (/vg craft)"], setting("CraftQueue", "on")),
    { "slider", L["Seconds a craft takes, for the per-hour ranking"], { min = 1, max = 60, step = 1 }, setting("CraftQueue", "secs") },
  }
end

-- The mail tools: their one switch (off until switched on).
local function mailRows()
  return {
    { "header", L["Mail tools"] },
    check(L["Search the inbox and send-to-alt presets beside the mail window (/vg mail)"], liveMethod("MailTools", "on", "Paint")),
  }
end

-- Spell ranks: the bar notice and trainer memory, both off until switched on.
local function spellRankRows()
  return {
    { "header", L["Spell ranks"] },
    check(L["Notice older spell ranks on bar buttons (/vg ranks)"], setting("SpellRanks", "barNotice")),
    check(L["Remember what trainers teach (/vg trainers)"], setting("SpellRanks", "trainerMemory")),
  }
end

-- Pet stable: the line at a stable master (/vg pets).
local function petStableRows()
  return {
    { "header", L["Pet stable"] },
    check(L["Say how many pets you have, and the next slot's price, at a stable master (/vg pets)"], setting("PetStable", "announce")),
    { "button", L["List my pets in chat"], function() ns.GetModule("PetStable").Command() end },
  }
end

-- The Legacy perk planner: its switch (/vg legacy plan).
local function legacyRows()
  return {
    { "header", L["Legacy"] },
    check(L["Legacy perk planner: a list of perks within the tree's 16 points (/vg legacy plan)"], setting("Legacy", "planner")),
  }
end

-- Instance prep's sliders: how long the card stays (seconds), and the durability warning (percent).
local PREP_SECONDS = { min = 5, max = 60, step = 5, format = function(v) return ns.Format(L["{seconds} s"], { seconds = v }) end }
local PREP_PERCENT = { min = 10, max = 90, step = 5, format = function(v) return string.format("%d%%", v) end }

-- Instance prep's dungeon card and buff checks (flask, food, oil or poison, raid buffs; world buffs), and the note on wanted amounts.
local function prepBuffRows()
  return {
    check(L["Dungeon card: level range, your dungeon quests and keys on the checklist"], setting("InstancePrep", "dungeonCard")),
    check(L["Buff checks on the card: flask, food, oil or poison, raid buffs"], setting("InstancePrep", "buffs")),
    check(L["World buffs among them"], setting("InstancePrep", "worldBuffs")),
    { "button", L["Set wanted amounts..."], function() ns.GetModule("InstancePrep").Wizard.Open() end, function() return ns.GetModule("InstancePrep").settings ~= nil end },
    { "text", L["Wanted amounts (food, bandages, potions, ammo, shards) are set in the window above or with /vg prep want <kind> <n>; items from /vg stock are checked too."] },
  }
end

-- Instance prep: when the checklist card shows, how long it stays, and the durability warning.
local function prepRows()
  local rows = {
    { "header", L["Instance prep"] },
    check(L["Checklist when you enter a dungeon or raid (only when something is low)"], setting("InstancePrep", "onEnter")),
    check(L["Checklist on a ready check"], setting("InstancePrep", "onReadyCheck")),
    check(L["Warn in chat when a supply runs low (once, out of combat)"], setting("InstancePrep", "lowWarn")),
    { "slider", L["Hide after"], PREP_SECONDS, setting("InstancePrep", "hideAfter") },
    { "slider", L["Durability warning under"], PREP_PERCENT, setting("InstancePrep", "durability") },
  }
  for _, r in ipairs(prepBuffRows()) do rows[#rows + 1] = r end
  return rows
end

-- Gear upgrades: the role the weights are for, and where upgrades show.
local function upgradeRows()
  local roles = { { "auto", L["group role, else damage"] }, { "damage", L["damage"] }, { "tank", L["tank"] }, { "healer", L["healer"] } }
  return {
    { "header", L["Gear upgrades"] },
    { "cycle", L["Weigh stats for"], roles, liveMethod("Upgrades", "role", "Changed") },
    check(L["Upgrade or downgrade on item tooltips"], setting("Upgrades", "tooltip")),
    check(L["Arrow on upgrades in the combined bag"], setting("Upgrades", "bags")), check(L["Arrow on quest rewards that are upgrades"], setting("Upgrades", "quests")),
    { "button", L["Set up stat weights"], function() O.Hide(); ns.GetModule("Upgrades").Wizard.Open() end },
    { "text", L["/vg weights shows the stat weights in use; wizard, set <stat> <n>, reset, export and import change or share them."] },
  }
end

-- Saved prices, sales and characters from the beta, and the button that clears them (Core/Home.lua).
local function betaRows()
  return {
    { "header", L["Data from the beta"] },
    { "text", L["Prices, sales and characters saved before launch (4 November 2026) stay until you clear them. Vendors are the same in both and stay."] },
    { "button", L["Clear data from before launch..."], function() ns.Home.AskClear() end, function() return ns.Home.Launched() end },
  }
end

-- The Town and gear page: the auction house, merchants, errands, crafting, mail, spells, Legacy, instance prep and gear upgrades.
local function townPageRows()
  local rows = append(append(auctionRows(), merchantRows()), errandRows())
  append(append(append(append(rows, craftRows()), mailRows()), spellRankRows()), petStableRows())
  return append(append(append(append(rows, legacyRows()), prepRows()), upgradeRows()), betaRows())
end

O.AddPage({ key = "town", title = L["Town and gear"], icon = "NavTown", order = 85, rows = townPageRows })
