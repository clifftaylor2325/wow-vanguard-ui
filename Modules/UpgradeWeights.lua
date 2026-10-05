-- Default stat weights for the gear upgrade indicator (Modules/Upgrades.lua):
-- how much one point of each stat is worth, per kind of character. A class
-- and a role pick the kind; /vg weights changes any weight for a profile.
--
-- These are a starting point written for WoW Forever's vanilla-style stats,
-- not simulated values: the owner reviews them, and players tune their own.
-- The stat names are the client's item stat keys (C_Item.GetItemStats);
-- a key Forever's items don't use simply never adds anything.

local ADDON, ns = ...

local W = {}
ns.UpgradeWeights = W

-- Short names -> the client's item stat keys.
W.STATS = {
  STR = "ITEM_MOD_STRENGTH_SHORT", AGI = "ITEM_MOD_AGILITY_SHORT", STA = "ITEM_MOD_STAMINA_SHORT",
  INT = "ITEM_MOD_INTELLECT_SHORT", SPI = "ITEM_MOD_SPIRIT_SHORT", ARMOR = "RESISTANCE0_NAME",
  AP = "ITEM_MOD_ATTACK_POWER_SHORT", RAP = "ITEM_MOD_RANGED_ATTACK_POWER_SHORT", SP = "ITEM_MOD_SPELL_POWER_SHORT",
  MP5 = "ITEM_MOD_MANA_REGENERATION_SHORT", CRIT = "ITEM_MOD_CRIT_RATING_SHORT", HIT = "ITEM_MOD_HIT_RATING_SHORT",
  HASTE = "ITEM_MOD_HASTE_RATING_SHORT", EXP = "ITEM_MOD_EXPERTISE_RATING_SHORT", ARP = "ITEM_MOD_ARMOR_PENETRATION_RATING_SHORT",
  DEF = "ITEM_MOD_DEFENSE_SKILL_RATING_SHORT", DODGE = "ITEM_MOD_DODGE_RATING_SHORT", PARRY = "ITEM_MOD_PARRY_RATING_SHORT",
  BLOCK = "ITEM_MOD_BLOCK_RATING_SHORT", BLOCKVALUE = "ITEM_MOD_BLOCK_VALUE_SHORT", DPS = "ITEM_MOD_DAMAGE_PER_SECOND_SHORT",
}

-- The client's item stat key -> its short name.
W.SHORT = {}
for short, key in pairs(W.STATS) do W.SHORT[key] = short end

-- Weights per kind of character; a stat left out is worth nothing.
W.KINDS = {
  strength = { STR = 1, AGI = 0.6, STA = 0.2, AP = 0.5, CRIT = 0.8, HIT = 0.9, HASTE = 0.6, EXP = 0.7, ARP = 0.4, DPS = 2.5, ARMOR = 0.01 },
  agility = { AGI = 1, STR = 0.5, STA = 0.2, AP = 0.5, RAP = 0.4, CRIT = 0.8, HIT = 0.9, HASTE = 0.6, EXP = 0.6, ARP = 0.4, DPS = 2, ARMOR = 0.01 },
  caster = { SP = 1, INT = 0.6, SPI = 0.2, STA = 0.2, CRIT = 0.7, HIT = 0.9, HASTE = 0.6, ARMOR = 0.005 },
  healer = { SP = 1, INT = 0.7, SPI = 0.5, MP5 = 1.2, STA = 0.2, CRIT = 0.5, HASTE = 0.6, ARMOR = 0.005 },
  tank = { STA = 1, ARMOR = 0.05, AGI = 0.6, STR = 0.5, DEF = 1, DODGE = 0.8, PARRY = 0.7, BLOCK = 0.5, BLOCKVALUE = 0.3, HIT = 0.4, EXP = 0.4, DPS = 0.6 },
}

-- Class -> role -> kind. A role a class doesn't have uses its damage kind.
W.CLASSES = {
  WARRIOR = { damage = "strength", tank = "tank" },
  PALADIN = { damage = "strength", tank = "tank", healer = "healer" },
  HUNTER = { damage = "agility" },
  ROGUE = { damage = "agility" },
  PRIEST = { damage = "caster", healer = "healer" },
  SHAMAN = { damage = "caster", healer = "healer" },
  MAGE = { damage = "caster" },
  WARLOCK = { damage = "caster" },
  DRUID = { damage = "agility", tank = "tank", healer = "healer" },
}

-- The kind of character a class in a role ("damage", "tank" or "healer") is; caster for a class not listed.
function W.Kind(class, role)
  local roles = W.CLASSES[class]
  if not roles then return "caster" end
  return roles[role] or roles.damage
end
