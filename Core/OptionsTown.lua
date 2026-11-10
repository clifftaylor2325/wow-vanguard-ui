-- The Town and gear page (/vg): the auction house, merchants and errands,
-- the craft queue and mail tools, spell ranks, instance prep and
-- gear upgrades. Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local L = ns.L

local O = ns.Options
local setting, reloadSetting, liveMethod, check, append = O.Setting, O.ReloadSetting, O.LiveMethod, O.Check, O.Append

-- The auction helper's scan, auction check, disenchant, crafting, deals and upgrades rows.
local function auctionScanRows()
  return {
    check(L["Scan button (one scan every 15 minutes)"], setting("AuctionHelper", "scanButton")),
    check(L["Recheck undercuts after posting"], setting("AuctionHelper", "recheck")),
    check(L["Disenchant values in tooltips"], ns.AuctionPrices.DisenchantSetting()),
    check(L["Crafting costs and profit"], setting("AuctionHelper", "crafting")),
    check(L["Deals list"], liveMethod("AuctionHelper", "deals", "PaintDeals")),
    check(L["Upgrades list"], liveMethod("AuctionHelper", "upgrades", "PaintUpgrades")),
  }
end

-- The auction helper: its tabs, tooltip prices, the sell card's undercut, length and vendor floor, then the scan rows.
local function auctionRows()
  return append({
    { "header", L["Auction house"] },
    check(L["Lists and Posting tabs"], setting("AuctionHelper", "panel")),
    check(L["Auction prices in tooltips"], setting("AuctionHelper", "tooltip")),
    { "cycle", L["Undercut by"], { { "copper", L["1 copper"] }, { "silver", L["1 silver"] }, { "percent", "1 %" }, { "match", L["Match"] } }, setting("AuctionHelper", "undercut") },
    { "cycle", L["Auction length"], ns.GetModule("AuctionHelper").DurationSettingChoices(), setting("AuctionHelper", "duration") },
    check(L["Never post under vendor price"], setting("AuctionHelper", "vendorFloor")),
  }, auctionScanRows())
end

-- Asks before forgetting every merchant Vanguard remembers (/vg vendors clear), which can't be undone.
local function askForgetMerchants()
  local VM = ns.GetModule("VendorMemory")
  ns.Ask(L["Forget every merchant Vanguard remembers? Tooltips and the stock list know them again as you visit them."], L["Forget"],
    function() VM.Command("clear") end, function() end, "danger")
end

-- At a merchant (the error line's switch is under Game windows, Quiet the game), the sell list and the merchants
-- Vanguard remembers.
local function merchantRows()
  return {
    { "header", L["Merchants"] },
    check(L["Repair with your own gold at a merchant"], setting("Merchant", "repair")),
    check(L["Sell gray items at a merchant"], setting("Merchant", "junk")),
    check(L["Offer to sell your sell list"], setting("Merchant", "listSell")),
    check(L["Stack and Max buttons at merchants"], setting("Merchant", "bulkBuy")),
    { "button", L["List my sell list in chat"], function() ns.GetModule("Merchant").JunkCommand("") end, function() return ns.GetModule("Merchant").settings ~= nil end },
    { "button", L["Forget every merchant..."], askForgetMerchants },
  }
end

-- Errands: training, stocking up and flight times.
local function errandRows()
  return {
    { "header", L["Errands"] },
    check(L["Train all button at trainers"], setting("Errands", "trainAll")),
    check(L["Keep items stocked from merchants"], setting("Errands", "stock")),
    { "button", L["Edit list..."], function() ns.GetModule("Errands").StockWindow.Open() end, function() return ns.GetModule("Errands").settings ~= nil end },
    check(L["Flight timer (reload)"], reloadSetting("Errands", "flightTimer")),
    check(L["Boat and zeppelin timer (reload)"], reloadSetting("Errands", "boatTimer")),
  }
end

-- The craft queue: its switch (off until switched on) and the pace the per-hour ranking assumes.
local function craftRows()
  return {
    { "header", L["Craft queue"] },
    check(L["Craft queue and recipe ranking"], setting("CraftQueue", "on")),
    { "slider", L["Seconds per craft"], { min = 1, max = 60, step = 1 }, setting("CraftQueue", "secs") },
    { "button", L["List the craft queue in chat"], function() ns.GetModule("CraftQueue").Command("") end },
  }
end

-- The mail tools: their one switch (off until switched on).
local function mailRows()
  return {
    { "header", L["Mail tools"] },
    check(L["Inbox search and send-to-alt presets"], liveMethod("MailTools", "on", "Paint")),
  }
end

-- Spell ranks: the bar notice and trainer memory, both off until switched on.
local function spellRankCard()
  return {
    { "header", L["Spell ranks"] },
    check(L["Notice older ranks on bars"], setting("SpellRanks", "barNotice")),
    check(L["Remember what trainers teach"], setting("SpellRanks", "trainerMemory")),
    { "button", L["Put the newest ranks on my bars"], function() ns.GetModule("SpellRanks").RanksCommand("swap") end },
    { "button", L["What trainers teach next"], function() ns.GetModule("SpellRanks").TrainersCommand("next") end },
  }
end

-- The card above, on the clients that have the module (WoW Forever).
local function spellRankRows()
  return O.ModuleRows("SpellRanks", spellRankCard)
end

-- Instance prep's sliders: how long the card stays (seconds), and the durability warning (percent).
local PREP_SECONDS = { min = 5, max = 60, step = 5, format = function(v) return ns.Format(L["{seconds} s"], { seconds = v }) end }
local PREP_PERCENT = { min = 10, max = 90, step = 5, format = function(v) return string.format("%d%%", v) end }

-- The dungeon card's switch, its tip saying what this client's card shows (Modules/DungeonCard.lua, DC.LABEL).
local function dungeonCardRows()
  return { O.Renamed(check(ns.DungeonCard.NAME, setting("InstancePrep", "dungeonCard")), ns.DungeonCard.LABEL) }
end

-- Instance prep's dungeon card and buff checks (flask, food, oil or poison, raid buffs; world buffs), and the note on wanted amounts.
local function prepBuffRows()
  return append(dungeonCardRows(), {
    check(L["Buff checks on the card"], setting("InstancePrep", "buffs")),
    check(L["World buffs among them"], setting("InstancePrep", "worldBuffs")),
    { "button", L["Set wanted amounts..."], function() ns.GetModule("InstancePrep").Wizard.Open() end, function() return ns.GetModule("InstancePrep").settings ~= nil end },
    { "text", L["Wanted amounts (food, bandages, potions, ammo, shards) are set in the window above or with /vg prep want <kind> <n>; items from /vg stock are checked too."] },
  })
end

-- Instance prep: when the checklist card shows, how long it stays, and the durability warning.
local function prepRows()
  local rows = {
    { "header", L["Instance prep"] },
    check(L["Checklist when you enter an instance"], setting("InstancePrep", "onEnter")),
    check(L["Checklist on a ready check"], setting("InstancePrep", "onReadyCheck")),
    check(L["Warn when a supply runs low"], setting("InstancePrep", "lowWarn")),
    { "slider", L["Hide after"], PREP_SECONDS, setting("InstancePrep", "hideAfter") },
    { "slider", L["Durability warning under"], PREP_PERCENT, setting("InstancePrep", "durability") },
  }
  for _, r in ipairs(prepBuffRows()) do rows[#rows + 1] = r end
  return rows
end

-- Gear upgrades' damage style row, for a class that has styles on WoW Forever (a druid's Feral or Balance); none for
-- the rest. The style is kept per class, so the row reads and sets your class's.
local function styleRows()
  local UP, W = ns.GetModule("Upgrades"), ns.UpgradeWeights
  local class = select(2, UnitClass("player"))
  local styles = W.STYLES[class]
  if not styles then return {} end
  local choices = {}
  for _, s in ipairs(styles) do choices[#choices + 1] = { s, UP.Word(s) } end
  local saved = O.ModuleSettings("Upgrades").styles
  return { { "cycle", L["Damage style"], choices, function() return W.Style(class, saved[class]) end, function(v) saved[class] = v UP.Changed() end } }
end

-- Gear upgrades: the role (and damage style) the weights are for, and where upgrades show.
local function upgradeRows()
  local roles = { { "auto", L["group role, else damage"] }, { "damage", L["damage"] }, { "tank", L["tank"] }, { "healer", L["healer"] } }
  local rows = { { "header", L["Gear upgrades"] }, { "cycle", L["Weigh stats for"], roles, liveMethod("Upgrades", "role", "Changed") } }
  return append(append(rows, styleRows()), {
    check(L["Upgrade or downgrade on item tooltips"], setting("Upgrades", "tooltip")),
    check(L["Arrow on upgrades in the combined bag"], setting("Upgrades", "bags")), check(L["Arrow on quest rewards that are upgrades"], setting("Upgrades", "quests")),
    { "button", L["Set up stat weights"], function() O.Hide(); ns.GetModule("Upgrades").Wizard.Open() end },
    { "button", L["Import stat weights"], function() O.Hide(); ns.GetModule("Upgrades").ImportDialog() end },
    { "text", L["/vg weights shows the stat weights in use; wizard, set <stat> <n>, reset, export and import change or share them."] },
  })
end

-- Saved prices, sales and characters from the beta, and the button that clears them (Core/Home.lua).
-- WoW Forever only: on Retail the same data is ordinary and there is no beta.
local function betaRows()
  if not ns.IsForever() then return {} end
  return {
    { "header", L["Data from the beta"] },
    { "text", L["Prices, sales and characters saved before launch (4 November 2026) stay until you clear them. Vendors are the same in both and stay."] },
    { "button", L["Clear data from before launch..."], function() ns.Home.AskClear() end, function() return ns.Home.Launched() end },
  }
end

-- The Town and gear page: the auction house, merchants, errands, crafting, mail, spells, instance prep and gear upgrades.
local function townPageRows()
  local rows = append(append(auctionRows(), merchantRows()), errandRows())
  append(append(append(rows, craftRows()), mailRows()), spellRankRows())
  return append(append(append(rows, prepRows()), upgradeRows()), betaRows())
end

O.AddPage({ key = "town", title = L["Town and gear"], icon = "NavTown", order = 85, rows = townPageRows })
