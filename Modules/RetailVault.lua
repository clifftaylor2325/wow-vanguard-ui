-- The Great Vault, Retail only: its window (Blizzard_WeeklyRewards, loaded when the game first opens it) in the
-- Vanguard look under a switch of its own, and a vault line on the info strip (off until switched on) that counts
-- the vault's unlocked slots this week, says when last week's reward waits, and opens the vault on a click.
--
-- The window's parts are data (GW.RETAIL_PARTS, dressed by Modules/RetailWindows.lua under ns.Try): its bronze
-- border, crest and dividers give way to the flat Vanguard panel, and the reward slots, the row pictures and the
-- chest stay the game's. The line reads C_WeeklyRewards, plain values only. The file loads on Retail only (its TOC
-- line's game-type tags); WoW Forever never reads it.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local O = ns.Options

local GW = ns.GetModule("Windows")
local IS = ns.GetModule("InfoStrip")

-- The vault window's switch, a group of its own beside the other game window groups, on by default.
GW.defaults.vault = true
table.insert(GW.GROUPS, "vault")

-- The vault window's parts by step, as dotted paths (Blizzard_WeeklyRewards.xml): the frame's border and crest and
-- each row's bronze edge faded, the select button themed, the row names and the header line in the theme's text.
GW.RETAIL_PARTS.WeeklyRewardsFrame = {
  fade = {
    "WeeklyRewardsFrame.BorderContainer", "WeeklyRewardsFrame.HeaderFrame.HeaderDivider", "WeeklyRewardsFrame.SelectRewardButton.Background",
    "WeeklyRewardsFrame.RaidFrame.Border", "WeeklyRewardsFrame.MythicFrame.Border", "WeeklyRewardsFrame.WorldFrame.Border",
    "WeeklyRewardsFrame.PVPFrame.Border",
  },
  button = { "WeeklyRewardsFrame.SelectRewardButton" },
  heading = {
    "WeeklyRewardsFrame.RaidFrame.Name", "WeeklyRewardsFrame.MythicFrame.Name", "WeeklyRewardsFrame.WorldFrame.Name",
    "WeeklyRewardsFrame.PVPFrame.Name",
  },
  label = { "WeeklyRewardsFrame.HeaderFrame.Text" },
}

GW.AddOnDemand("vault", "Blizzard_WeeklyRewards", { "WeeklyRewardsFrame" }, GW.SkinRetailWindow)

-- The info strip's vault line ---------------------------------------------------------------------

-- Off until switched on; it shares the gold row, on the right.
IS.defaults.vault = false
IS.BLOCKS.vault = { 2, "RIGHT" }
IS.EVENTS.WEEKLY_REWARDS_UPDATE = "vault"

-- The vault's rows in the window's order: the activity type (Enum.WeeklyRewardChestThresholdType) and its name in
-- the tooltip. Rated PvP shows only when the vault has no world row this week, as the window does.
IS.VAULT_ROWS = {
  { kind = "Raid", label = L["Raids"] },
  { kind = "Activities", label = L["Dungeons"] },
  { kind = "World", label = L["World"] },
  { kind = "RankedPvP", label = L["Rated PvP"], onlyWithout = "World" },
}

-- The vault's activities of one row type; none when the client lacks the vault or the type.
local function activities(kind)
  local types = type(Enum) == "table" and Enum.WeeklyRewardChestThresholdType
  local id = type(types) == "table" and types[kind]
  if id == nil then return {} end
  return ns.CallIf(C_WeeklyRewards, "GetActivities", id) or {}
end

-- One row's slots: how many are unlocked, how many it has, and the first locked one's progress and threshold
-- ({ progress, threshold }, nil when all are unlocked). A slot whose figures are not plain numbers is left out.
local function rowSlots(kind)
  local done, count, nextSlot = 0, 0, nil
  for _, slot in ipairs(activities(kind)) do
    local progress, threshold = ns.PlainNumber(slot.progress), ns.PlainNumber(slot.threshold)
    if progress and threshold and threshold > 0 then
      count = count + 1
      if progress >= threshold then done = done + 1 elseif not nextSlot then nextSlot = { progress, threshold } end
    end
  end
  return done, count, nextSlot
end

-- The vault's rows this week, each { label, done, count, nextSlot }: every type with slots, the ones that show only
-- without another left out when that one has slots.
---@return table[]
function IS.VaultRows()
  local rows, has = {}, {}
  for _, row in ipairs(IS.VAULT_ROWS) do
    local done, count, nextSlot = rowSlots(row.kind)
    has[row.kind] = count > 0
    local shown = count > 0 and not has[row.onlyWithout or ""]
    if shown then rows[#rows + 1] = { label = row.label, done = done, count = count, nextSlot = nextSlot } end
  end
  return rows
end

-- Whether last week's reward waits in the vault to be picked.
---@return boolean
function IS.VaultRewardWaits()
  return ns.IsTrue(ns.CallIf(C_WeeklyRewards, "HasAvailableRewards"))
end

-- The vault line: the reward waiting (in the accent), else the slots unlocked of all this week's; nothing when the
-- vault has no slots (or the client can't say).
function IS.TEXT.vault()
  if IS.VaultRewardWaits() then return L["Vault reward waiting"], "accent" end
  local done, count = 0, 0
  for _, row in ipairs(IS.VaultRows()) do done, count = done + row.done, count + row.count end
  if count > 0 then return ns.Format(L["Vault {done}/{count}"], { done = done, count = count }), "text" end
end

-- One row's figures in the tooltip: its unlocked slots, and the progress to the next one while one is locked.
local function rowFigures(row)
  local unlocked = ns.Format(L["{done}/{count} unlocked"], { done = row.done, count = row.count })
  if not row.nextSlot then return unlocked end
  return ns.Format(L["{unlocked}, next {progress}/{threshold}"], { unlocked = unlocked, progress = row.nextSlot[1], threshold = row.nextSlot[2] })
end

-- The vault line's tooltip: each row's figures (the name muted), then the waiting reward.
local function vaultTip(tt)
  local r, g, b = T.RGB("text2")
  for _, row in ipairs(IS.VaultRows()) do tt:AddDoubleLine(row.label, rowFigures(row), r, g, b, T.RGB("text")) end
  if IS.VaultRewardWaits() then tt:AddLine(L["Last week's reward waits in the vault"], T.RGB("accent")) end
end

IS.TIPS.vault = { L["Great Vault"], vaultTip }
IS.CLICKS.vault = { L["The Great Vault"], "WeeklyRewards_ShowUI", hint = L["Click: the Great Vault"] }

-- The switches on the Game windows page, under the other game window groups: the window's look, and the line.
ns.RetailRows(function()
  return {
    O.Check(L["Great Vault window (reload)"], O.ReloadSetting("Windows", "vault")),
    O.Check(L["Great Vault progress on the info strip"], O.LiveMethod("InfoStrip", "vault", "UpdateAll")),
  }
end)
