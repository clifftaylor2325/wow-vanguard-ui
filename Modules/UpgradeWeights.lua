-- Default stat weights for the gear upgrade indicator (Modules/Upgrades.lua):
-- how much one point of each stat is worth, per kind of character. A class, a role and on WoW Forever a damage
-- style pick the kind (on Retail a damage dealer's follows the specialization's primary stat); /vg weights changes
-- any weight, per class, for a profile.
--
-- These are a starting point written for WoW Forever's vanilla-style stats,
-- not simulated values: the owner reviews them, and players tune their own.
-- The stat names are the client's item stat keys (C_Item.GetItemStats);
-- a key Forever's items don't use simply never adds anything. Retail has its
-- own stats (mastery, versatility, no hit or spell power), its 13 classes and
-- item level, so each table is per client (ns.ClientData): WoW Forever's is
-- the one it has always had.

local ADDON, ns = ...

local W = {}
ns.UpgradeWeights = W

-- Short names -> the client's item stat keys.
W.STATS = ns.ClientData({
  forever = {
    STR = "ITEM_MOD_STRENGTH_SHORT", AGI = "ITEM_MOD_AGILITY_SHORT", STA = "ITEM_MOD_STAMINA_SHORT",
    INT = "ITEM_MOD_INTELLECT_SHORT", SPI = "ITEM_MOD_SPIRIT_SHORT", ARMOR = "RESISTANCE0_NAME",
    AP = "ITEM_MOD_ATTACK_POWER_SHORT", RAP = "ITEM_MOD_RANGED_ATTACK_POWER_SHORT", SP = "ITEM_MOD_SPELL_POWER_SHORT",
    MP5 = "ITEM_MOD_MANA_REGENERATION_SHORT", CRIT = "ITEM_MOD_CRIT_RATING_SHORT", HIT = "ITEM_MOD_HIT_RATING_SHORT",
    HASTE = "ITEM_MOD_HASTE_RATING_SHORT", EXP = "ITEM_MOD_EXPERTISE_RATING_SHORT", ARP = "ITEM_MOD_ARMOR_PENETRATION_RATING_SHORT",
    DEF = "ITEM_MOD_DEFENSE_SKILL_RATING_SHORT", DODGE = "ITEM_MOD_DODGE_RATING_SHORT", PARRY = "ITEM_MOD_PARRY_RATING_SHORT",
    BLOCK = "ITEM_MOD_BLOCK_RATING_SHORT", BLOCKVALUE = "ITEM_MOD_BLOCK_VALUE_SHORT", DPS = "ITEM_MOD_DAMAGE_PER_SECOND_SHORT",
  },
  -- Retail's: the primary stats, the four secondaries and armor, plus ILVL, the item's level (Upgrades reads it from
  -- the item, as no stat key holds it).
  retail = {
    STR = "ITEM_MOD_STRENGTH_SHORT", AGI = "ITEM_MOD_AGILITY_SHORT", INT = "ITEM_MOD_INTELLECT_SHORT", STA = "ITEM_MOD_STAMINA_SHORT",
    CRIT = "ITEM_MOD_CRIT_RATING_SHORT", HASTE = "ITEM_MOD_HASTE_RATING_SHORT", MASTERY = "ITEM_MOD_MASTERY_RATING_SHORT",
    VERS = "ITEM_MOD_VERSATILITY", ARMOR = "RESISTANCE0_NAME", DPS = "ITEM_MOD_DAMAGE_PER_SECOND_SHORT", ILVL = "ITEM_LEVEL",
  },
})

-- How much rating makes 1% (defense: one point of skill) at level 60 on WoW Forever, whose items list their
-- "Equip: ... by 2%" lines as rating (C_Item.GetItemStats gave Lionheart Helm's 2% crit and 2% hit as 28 and 20,
-- seen 2026-11-06). Crit and hit are that reading; the rest are the same level-60 combat rating table's, not yet
-- seen on an item. Guide sites' weight strings count these per 1% (per point of defense), so an import divides by
-- them, and a cap falls back to them when the client can't say (UP.PerUnit). Retail's strings already count rating.
W.RATING_PER_UNIT = ns.ClientData({
  forever = { CRIT = 14, HIT = 10, HASTE = 10, DODGE = 12, PARRY = 15, BLOCK = 5, EXP = 10, DEF = 1.5 },
  retail = {},
})

-- The stats a cap can be set for, in the order the wizard lists them: hit and expertise in per cent, defense in
-- skill. Retail's items have none of them.
W.CAP_STATS = ns.ClientData({ forever = { "HIT", "EXP", "DEF" }, retail = {} })

-- The combat rating each capped stat is counted from (the client's CR_ indexes; a caster's hit is CR_HIT_SPELL).
W.CAP_RATING = { HIT = 6, SPELLHIT = 8, EXP = 24, DEF = 2 }

-- The caps each kind starts with on WoW Forever, against a raid boss three levels up. Hit: 8% melee and 17% spell,
-- what the guides measured on the beta (Blizzard has published none). Expertise: the boss's 6.5% dodge, and defense:
-- 440 skill, where a boss's 5% crit (0.04% a point over 315) is gone, both from the client's own character sheet
-- (Camelot PaperDollFrameStats.lua). A player changes any of them in the wizard.
W.CAPS = ns.ClientData({
  forever = {
    strength = { HIT = 8, EXP = 6.5 }, agility = { HIT = 8, EXP = 6.5 }, tank = { HIT = 8, EXP = 6.5, DEF = 440 },
    caster = { HIT = 17 }, balance = { HIT = 17 }, healer = {},
  },
  retail = {},
})

-- The client's item stat key -> its short name.
W.SHORT = {}
for short, key in pairs(W.STATS) do W.SHORT[key] = short end

-- Weights per kind of character; a stat left out is worth nothing.
W.KINDS = ns.ClientData({
  forever = {
    strength = { STR = 1, AGI = 0.6, STA = 0.2, AP = 0.5, CRIT = 0.8, HIT = 0.9, HASTE = 0.6, EXP = 0.7, ARP = 0.4, DPS = 2.5, ARMOR = 0.01 },
    agility = { AGI = 1, STR = 0.5, STA = 0.2, AP = 0.5, RAP = 0.4, CRIT = 0.8, HIT = 0.9, HASTE = 0.6, EXP = 0.6, ARP = 0.4, DPS = 2, ARMOR = 0.01 },
    caster = { SP = 1, INT = 0.6, SPI = 0.2, STA = 0.2, CRIT = 0.7, HIT = 0.9, HASTE = 0.6, ARMOR = 0.005 },
    healer = { SP = 1, INT = 0.7, SPI = 0.5, MP5 = 1.2, STA = 0.2, CRIT = 0.5, HASTE = 0.6, ARMOR = 0.005 },
    tank = { STA = 1, ARMOR = 0.05, AGI = 0.6, STR = 0.5, DEF = 1, DODGE = 0.8, PARRY = 0.7, BLOCK = 0.5, BLOCKVALUE = 0.3, HIT = 0.4, EXP = 0.4, DPS = 0.6 },
    -- A Balance druid's: the owner's estimates from the guides' stat order, not published values (Forever has none
    -- yet). He gave crit 10, hit 12 and haste 7 per 1%; items carry rating, so those are divided by the rating that
    -- makes 1% (W.RATING_PER_UNIT).
    balance = { SP = 1, CRIT = 0.71, HIT = 1.2, INT = 0.4, HASTE = 0.7, SPI = 0.1 },
  },
  -- Retail's: the primary stat first, the four secondaries close behind it (which one leads changes with the spec and the
  -- patch, so they start near equal), item level as much as a point of the primary stat. A tank's item has the
  -- strength or the agility its wearer uses, never both, so the tank kind weighs either.
  retail = {
    strength = { STR = 1, CRIT = 0.45, HASTE = 0.45, MASTERY = 0.4, VERS = 0.4, STA = 0.05, DPS = 0.5, ILVL = 1, ARMOR = 0.005 },
    agility = { AGI = 1, CRIT = 0.45, HASTE = 0.45, MASTERY = 0.4, VERS = 0.4, STA = 0.05, DPS = 0.5, ILVL = 1, ARMOR = 0.005 },
    caster = { INT = 1, CRIT = 0.45, HASTE = 0.45, MASTERY = 0.4, VERS = 0.4, STA = 0.05, ILVL = 1, ARMOR = 0.002 },
    healer = { INT = 1, HASTE = 0.45, CRIT = 0.4, MASTERY = 0.4, VERS = 0.4, STA = 0.05, ILVL = 1, ARMOR = 0.002 },
    tank = { STA = 0.5, STR = 1, AGI = 1, VERS = 0.5, HASTE = 0.4, MASTERY = 0.4, CRIT = 0.35, ARMOR = 0.02, DPS = 0.5, ILVL = 1 },
  },
})

-- Class -> role -> kind. A role a class doesn't have uses its damage kind.
W.CLASSES = ns.ClientData({
  forever = {
    WARRIOR = { damage = "strength", tank = "tank" },
    PALADIN = { damage = "strength", tank = "tank", healer = "healer" },
    HUNTER = { damage = "agility" },
    ROGUE = { damage = "agility" },
    PRIEST = { damage = "caster", healer = "healer" },
    SHAMAN = { damage = "caster", healer = "healer" },
    MAGE = { damage = "caster" },
    WARLOCK = { damage = "caster" },
    DRUID = { damage = "agility", tank = "tank", healer = "healer" },
  },
  -- Retail's thirteen classes.
  retail = {
    WARRIOR = { damage = "strength", tank = "tank" },
    PALADIN = { damage = "strength", tank = "tank", healer = "healer" },
    HUNTER = { damage = "agility" },
    ROGUE = { damage = "agility" },
    PRIEST = { damage = "caster", healer = "healer" },
    DEATHKNIGHT = { damage = "strength", tank = "tank" },
    SHAMAN = { damage = "caster", healer = "healer" },
    MAGE = { damage = "caster" },
    WARLOCK = { damage = "caster" },
    MONK = { damage = "agility", tank = "tank", healer = "healer" },
    DRUID = { damage = "agility", tank = "tank", healer = "healer" },
    DEMONHUNTER = { damage = "agility", tank = "tank" },
    EVOKER = { damage = "caster", healer = "healer" },
  },
})

-- A class's damage styles on WoW Forever, which has no specializations to tell them apart; the first is the one a
-- class has until you pick another. Retail's specialization picks instead (W.DamageKind).
W.STYLES = ns.ClientData({
  forever = { DRUID = { "feral", "balance" }, SHAMAN = { "elemental", "enhancement" } },
  retail = {},
})

-- The kind of character each damage style is.
W.STYLE_KINDS = { feral = "agility", balance = "balance", elemental = "caster", enhancement = "strength" }

-- The kinds whose hit is spell hit (the others' is melee hit).
W.SPELL_KINDS = { caster = true, healer = true, balance = true }

-- A class's damage style: the one asked for when the class has it, else its first; nil for a class with none.
function W.Style(class, style)
  local styles = W.STYLES[class]
  if not styles then return nil end
  for _, s in ipairs(styles) do if s == style then return s end end
  return styles[1]
end

-- The classes that use a kind of character, in a role or a damage style (as a set).
function W.ClassesOf(kind)
  local out = {}
  for class, roles in pairs(W.CLASSES) do
    for _, k in pairs(roles) do if k == kind then out[class] = true end end
  end
  for class, styles in pairs(W.STYLES) do
    for _, s in ipairs(styles) do if W.STYLE_KINDS[s] == kind then out[class] = true end end
  end
  return out
end

-- Retail: your specialization's role (as Vanguard names it) and primary stat (the client's LE_UNIT_STAT index), or
-- nil for what the client won't say.
local function retailSpec()
  local index = ns.SpecIndex()
  local api = index and C_SpecializationInfo
  local info = api and api.GetSpecializationInfo
  if type(info) ~= "function" then return nil, nil end
  local _, _, _, _, role, stat = info(index)
  return ns.RoleKey(role), ns.PlainNumber(stat)
end

-- The role your specialization has on Retail, nil on WoW Forever (it has no specialization role).
function W.SpecRole()
  if ns.IsForever() then return nil end
  return (retailSpec())
end

-- Retail: the kind of damage dealer each primary stat makes (Enhancement is Agility, Balance Intellect).
function W.PrimaryKinds()
  return { [LE_UNIT_STAT_STRENGTH] = "strength", [LE_UNIT_STAT_AGILITY] = "agility", [LE_UNIT_STAT_INTELLECT] = "caster" }
end

-- A damage dealer's kind: on Retail the one for the specialization's primary stat, else the class's (fallback).
function W.DamageKind(fallback)
  if ns.IsForever() then return fallback end
  local _, stat = retailSpec()
  return W.PrimaryKinds()[stat] or fallback
end

-- The kind of character a class in a role ("damage", "tank" or "healer") and a damage style (W.STYLES; nil for the
-- class's first) is; caster for a class not listed.
function W.Kind(class, role, style)
  local roles = W.CLASSES[class]
  if not roles then return "caster" end
  if role ~= "damage" and roles[role] then return roles[role] end
  local own = W.Style(class, style)
  return W.DamageKind(own and W.STYLE_KINDS[own] or roles.damage)
end
