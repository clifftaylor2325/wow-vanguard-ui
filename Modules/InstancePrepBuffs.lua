-- Instance prep, buff checks (off until you switch them on): extra rows on the
-- checklist card for what you came without: a flask, food that feeds you (Well
-- Fed), an oil, stone or poison on your weapon, the raid buffs your group is missing from
-- you (Power Word: Fortitude, Mark of the Wild, Arcane Intellect) and, if you
-- ask for it, any world buff. A row says "missing" in red. They are read from
-- your own auras and your weapons, out of combat only; while the client hides
-- aura values nothing is checked and no row is made, never a guess.
-- Each check lists spells by id and asks the client for their names, so it holds on
-- every client language: every rank of a buff, and every food's Well Fed, shares the
-- one name. A buff whose name holds one of those names counts too (a camp's "Gift of
-- the Wild" variant), and a check whose ids the client can't name makes no row.
-- UNVERIFIED: the ids are from the classic database, not checked against a Forever
-- client. /vg prep buffs lists your buffs against what each check counts, to check them in game.

local ADDON, ns = ...

local L = ns.L

local PR = ns.GetModule("InstancePrep")

-- Buff groups by spell id (any one of them counts). The names in the comments are the English client's.
-- Flask of the Titans, Flask of Distilled Wisdom, Flask of Supreme Power, Flask of Chromatic Resistance.
PR.FLASKS = { 17626, 17627, 17628, 17629 }
-- Well Fed: one food's buff names them all.
PR.FOOD = { 19705 }
-- Row label -> Power Word: Fortitude, Prayer of Fortitude; Mark of the Wild, Gift of the Wild; Arcane Intellect, Arcane Brilliance.
PR.RAID_BUFFS = {
  { L["Fortitude"], { 1243, 21562 } },
  { L["Mark of the Wild"], { 1126, 21849 } },
  { L["Arcane Intellect"], { 1459, 23028 } },
}
-- Rallying Cry of the Dragonslayer, Spirit of Zandalar, Songflower Serenade, Warchief's Blessing, Fengus' Ferocity,
-- Slip'kik's Savvy, Mol'dar's Moxie.
PR.WORLD_BUFFS = { 22888, 24425, 15366, 16609, 22817, 22820, 22818 }
-- Item class Weapon (Enum.ItemClass.Weapon), and the weapon slots checked (main hand 16, off hand 17) with their row labels.
PR.WEAPON = 2
PR.ENCHANT_SLOTS = { { 16, L["Weapon oil or poison"] }, { 17, L["Off-hand oil or poison"] } }

-- How many of your buffs are read for the names (the game shows 32 at most).
PR.SCAN = 40

-- Whether a buff's name is plain text holding one of the words (names).
local function nameHas(name, words)
  if type(name) ~= "string" or ns.IsSecret(name) then return false end
  for _, w in ipairs(words) do
    if name:find(w, 1, true) then return true end
  end
  return false
end

-- The names of your helpful buffs the client lists (hidden or missing names left out).
function PR.BuffNames()
  local names = {}
  for i = 1, PR.SCAN do
    local aura = ns.Auras.Get("player", i, "HELPFUL")
    if not aura then break end
    if type(aura.name) == "string" and not ns.IsSecret(aura.name) then names[#names + 1] = aura.name end
  end
  return names
end

-- Whether any buff on you has one of these names in its name.
local function hasWord(words)
  for _, name in ipairs(PR.BuffNames()) do
    if nameHas(name, words) then return true end
  end
  return false
end

-- Whether you have one of the buffs (by name); nil when the client can't be asked.
local function hasAny(names)
  local get = C_UnitAuras and C_UnitAuras.GetAuraDataBySpellName
  if type(get) ~= "function" then return nil end
  for _, name in ipairs(names) do
    if get("player", name, "HELPFUL") then return true end
  end
  return false
end

-- A "missing" row for a buff group (spell ids) you lack, or nil: also when the client names none of them.
local function missing(label, ids)
  local names = ns.SpellNames(ids)
  if #names > 0 and hasAny(names) == false and not hasWord(names) then return { label = label, value = L["missing"] } end
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
    if have and not have[w[1]] and isWeapon(w[1]) then rows[#rows + 1] = { label = w[2], value = L["missing"] } end
  end
  return rows
end

-- Appends a row to the list, unless there is none (a buff you have makes no row, and a hole would hide the rows after it).
local function push(rows, row)
  if row then rows[#rows + 1] = row end
end

-- The buff checks always made, in the card's order, as { label, spell ids }: flask, food, the raid buffs.
function PR.Checks()
  local checks = { { L["Flask"], PR.FLASKS }, { L["Food buff"], PR.FOOD } }
  for _, b in ipairs(PR.RAID_BUFFS) do checks[#checks + 1] = b end
  return checks
end

-- The world buffs' check, made only when you ask for it.
local function worldCheck()
  return { L["World buffs"], PR.WORLD_BUFFS }
end

-- The aura rows: flask, food and the raid buffs you lack, then "World buffs" when you ask for them and have none.
function PR.AuraRows()
  local rows = {}
  for _, c in ipairs(PR.Checks()) do push(rows, missing(c[1], c[2])) end
  if PR.settings.worldBuffs then push(rows, missing(unpack(worldCheck()))) end
  return rows
end

-- Every check, the world buffs' too, for the buff report.
local function allChecks()
  local checks = PR.Checks()
  checks[#checks + 1] = worldCheck()
  return checks
end

-- Every buff row (flask, food, weapon enchants, raid buffs, world buffs), or none: when the setting
-- is off, in combat, or while the client hides aura values.
function PR.BuffRows()
  if not PR.settings.buffs or ns.InCombat() or ns.AurasSecret() then return {} end
  local rows = PR.AuraRows()
  for _, r in ipairs(PR.EnchantRows()) do rows[#rows + 1] = r end
  return rows
end

-- The check one of your buffs counts for, by the client's names for its spells (nil for none).
local function countsFor(name)
  for _, c in ipairs(allChecks()) do
    if nameHas(name, ns.SpellNames(c[2])) then return c[1] end
  end
end

-- What one check looks for, as "Flask: a, b" in the client's names, or says it is off when the client names none.
local function lookingFor(check)
  local names = ns.SpellNames(check[2])
  return check[1] .. ": " .. (#names > 0 and table.concat(names, ", ") or "none this client knows, so no row")
end

-- What each check looks for, as "Flask: a, b; Food buff: c; ...".
local function lookFor()
  local parts = {}
  for _, c in ipairs(allChecks()) do parts[#parts + 1] = lookingFor(c) end
  return table.concat(parts, "; ")
end

-- /vg prep buffs: your buffs one per line with the check each counts for, then what each check expects,
-- so the names can be checked against the real client (out of combat; none while the client hides auras).
function PR.BuffReport()
  if ns.InCombat() or ns.AurasSecret() then return ns.Chat("Buffs are listed out of combat, and not while the game hides aura values.") end
  local names = PR.BuffNames()
  ns.Chat(string.format("Your %d buff(s), and the Instance prep check each counts for:", #names))
  for _, name in ipairs(names) do ns.Chat(string.format("  %s -> %s", name, countsFor(name) or "no check")) end
  ns.Chat("The checks count any buff with one of these names in its name: " .. lookFor() .. ".")
end
