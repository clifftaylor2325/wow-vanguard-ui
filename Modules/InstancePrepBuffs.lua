-- Instance prep, buff checks (off until you switch them on): extra rows on the
-- checklist card for what you came without: a flask, food that feeds you (Well
-- Fed), an oil, stone or poison on your weapon, the raid buffs your group is missing from
-- you (Power Word: Fortitude, Mark of the Wild, Arcane Intellect) and, if you
-- ask for it, any world buff. A row says "missing" in red. They are read from
-- your own auras and your weapons, out of combat only; while the client hides
-- aura values nothing is checked and no row is made, never a guess.
-- UNVERIFIED: the buff names are from the classic game; none is checked against
-- a Forever client. Check each with /vg prep in game.

local ADDON, ns = ...

local PR = ns.GetModule("InstancePrep")

-- Buff groups: row label -> the aura names that count (any one of them).
PR.FLASKS = { "Flask of the Titans", "Flask of Supreme Power", "Flask of Distilled Wisdom", "Flask of Chromatic Resistance" }
PR.FOOD = { "Well Fed" }
PR.RAID_BUFFS = {
  { "Fortitude", { "Power Word: Fortitude", "Prayer of Fortitude" } },
  { "Mark of the Wild", { "Mark of the Wild", "Gift of the Wild" } },
  { "Arcane Intellect", { "Arcane Intellect", "Arcane Brilliance" } },
}
PR.WORLD_BUFFS = { "Rallying Cry of the Dragonslayer", "Spirit of Zandalar", "Songflower Serenade", "Warchief's Blessing", "Fengus' Ferocity", "Slip'kik's Savvy", "Mol'dar's Moxie" }
-- Item class Weapon (Enum.ItemClass.Weapon), and the weapon slots checked (main hand 16, off hand 17) with their row labels.
PR.WEAPON = 2
PR.ENCHANT_SLOTS = { { 16, "Weapon oil or poison" }, { 17, "Off-hand oil or poison" } }

-- Whether you have one of the buffs (by name); nil when the client can't be asked.
local function hasAny(names)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataBySpellName
  if type(get) ~= "function" then return nil end
  for _, name in ipairs(names) do
    if get("player", name, "HELPFUL") then return true end
  end
  return false
end

-- A "missing" row for a buff group you lack, or nil.
local function missing(label, names)
  if hasAny(names) == false then return { label = label, value = "missing" } end
end

-- Whether the item in a slot is a weapon (item class Weapon).
local function isWeapon(slot)
  local link = GetInventoryItemLink("player", slot)
  local info = C_Item and C_Item.GetItemInfoInstant
  if ns.IsSecret(link) or not link or type(info) ~= "function" then return false end
  return ns.PlainNumber((select(6, info(link)))) == PR.WEAPON
end

-- Whether the client can list your weapon enchants (the call PlayerAuras reads them with).
local function canListEnchants()
  return type(C_Item and C_Item.GetWeaponEnchantInfo) == "function" and Enum and Enum.WeaponSlot ~= nil
end

-- The slots among your weapons' timed enchants (PlayerAuras reads them), as a set.
local function enchanted()
  local set = {}
  for _, e in ipairs(ns.GetModule("PlayerAuras").Enchants()) do set[e.inv] = true end
  return set
end

-- A row for each weapon (main hand, and off hand when it holds a weapon) with no timed enchant (oil,
-- stone, poison or imbue).
function PR.EnchantRows()
  local rows, have = {}, canListEnchants() and enchanted()
  for _, w in ipairs(PR.ENCHANT_SLOTS) do
    if have and not have[w[1]] and isWeapon(w[1]) then rows[#rows + 1] = { label = w[2], value = "missing" } end
  end
  return rows
end

-- The aura rows: flask, food and the raid buffs you lack, then "World buffs" when you ask for them and have none.
function PR.AuraRows()
  local rows = { missing("Flask", PR.FLASKS), missing("Food buff", PR.FOOD) }
  for _, b in ipairs(PR.RAID_BUFFS) do rows[#rows + 1] = missing(b[1], b[2]) end
  if PR.settings.worldBuffs then rows[#rows + 1] = missing("World buffs", PR.WORLD_BUFFS) end
  return rows
end

-- Every buff row (flask, food, weapon enchants, raid buffs, world buffs), or none: when the setting
-- is off, in combat, or while the client hides aura values.
function PR.BuffRows()
  if not PR.settings.buffs or ns.InCombat() or ns.AurasSecret() then return {} end
  local rows = PR.AuraRows()
  for _, r in ipairs(PR.EnchantRows()) do rows[#rows + 1] = r end
  return rows
end
