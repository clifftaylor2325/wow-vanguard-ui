-- TEST-ONLY Retail stubs, data area: what the per-client data tables read on Retail (scripts/lib/wow-retail-core.lua
-- says how these files run). Checked against Blizzard's live API docs (wow-ui-source, live branch, 12.1.5):
-- UnitHonor, UnitHonorMax and UnitHonorLevel (UnitDocumentation), C_PvP.IsActiveBattlefield (PvpInfoDocumentation),
-- C_Reputation.IsMajorFaction (ReputationInfoDocumentation), C_MajorFactions.GetMajorFactionData and HasMaximumRenown
-- (MajorFactionsDocumentation), C_Item.GetDetailedItemLevelInfo (ItemDocumentation). IsWatchingHonorAsXP and
-- IsInActiveWorldPVP are undocumented; the game's own honor bar asks them (Blizzard_ActionBar's
-- StatusTrackingManagerOverrides).

local world = __wfgWorld

-- Retail's spells the data tables list, by id, with the English client's name: the fixture the data tests check every
-- id against, so a table and its comment can't drift apart. UNVERIFIED on a Retail client, like the tables.
local RETAIL_SPELLS = {
  -- Priest.
  [2061] = "Flash Heal", [2060] = "Heal", [139] = "Renew", [596] = "Prayer of Healing", [2050] = "Holy Word: Serenity",
  [34861] = "Holy Word: Sanctify", [33076] = "Prayer of Mending", [47540] = "Penance", [194509] = "Power Word: Radiance",
  [204883] = "Circle of Healing", [120517] = "Halo", [64843] = "Divine Hymn", [373481] = "Power Word: Life",
  [17] = "Power Word: Shield", [527] = "Purify", [213634] = "Purify Disease", [33206] = "Pain Suppression",
  [47788] = "Guardian Spirit", [73325] = "Leap of Faith", [10060] = "Power Infusion", [21562] = "Power Word: Fortitude",
  [1706] = "Levitate", [2006] = "Resurrection",
  -- Druid.
  [774] = "Rejuvenation", [8936] = "Regrowth", [48438] = "Wild Growth", [18562] = "Swiftmend", [33763] = "Lifebloom",
  [740] = "Tranquility", [145205] = "Efflorescence", [102351] = "Cenarion Ward", [50464] = "Nourish", [392160] = "Invigorate",
  [102693] = "Grove Guardians", [203651] = "Overgrowth", [88423] = "Nature's Cure", [2782] = "Remove Corruption",
  [102342] = "Ironbark", [1126] = "Mark of the Wild", [29166] = "Innervate", [20484] = "Rebirth",
  -- Paladin.
  [19750] = "Flash of Light", [82326] = "Holy Light", [20473] = "Holy Shock", [85673] = "Word of Glory",
  [85222] = "Light of Dawn", [633] = "Lay on Hands", [114165] = "Holy Prism", [148039] = "Barrier of Faith",
  [114158] = "Light's Hammer", [4987] = "Cleanse", [213644] = "Cleanse Toxins", [1022] = "Blessing of Protection",
  [1044] = "Blessing of Freedom", [6940] = "Blessing of Sacrifice", [204018] = "Blessing of Spellwarding",
  [53563] = "Beacon of Light", [156910] = "Beacon of Faith", [7328] = "Redemption",
  -- Shaman.
  [8004] = "Healing Surge", [77472] = "Healing Wave", [1064] = "Chain Heal", [61295] = "Riptide", [974] = "Earth Shield",
  [73920] = "Healing Rain", [73685] = "Unleash Life", [197995] = "Wellspring", [77130] = "Purify Spirit",
  [51886] = "Cleanse Spirit", [462854] = "Skyfury", [546] = "Water Walking", [2008] = "Ancestral Spirit",
  -- Monk.
  [116670] = "Vivify", [115151] = "Renewing Mist", [124682] = "Enveloping Mist", [115175] = "Soothing Mist",
  [116849] = "Life Cocoon", [115310] = "Revival", [399491] = "Sheilun's Gift", [115450] = "Detox", [218164] = "Detox",
  [116841] = "Tiger's Lust", [115178] = "Resuscitate",
  -- Evoker.
  [361469] = "Living Flame", [355913] = "Emerald Blossom", [360995] = "Verdant Embrace", [355936] = "Dream Breath",
  [367226] = "Spiritbloom", [366155] = "Reversion", [364343] = "Echo", [373861] = "Temporal Anomaly",
  [360823] = "Naturalize", [365585] = "Expunge", [374251] = "Cauterizing Flame", [357170] = "Time Dilation",
  [370665] = "Rescue", [364342] = "Blessing of the Bronze", [369459] = "Source of Magic", [361227] = "Return",
  -- The other classes.
  [1459] = "Arcane Intellect", [475] = "Remove Curse", [130] = "Slow Fall", [5697] = "Unending Breath",
  [20707] = "Soulstone", [3411] = "Intervene", [6673] = "Battle Shout", [61999] = "Raise Ally", [34477] = "Misdirection",
  [57934] = "Tricks of the Trade",
  -- Food.
  [19705] = "Well Fed",
}
for id, name in pairs(RETAIL_SPELLS) do
  world.spells[id] = world.spells[id] or { name = name, icon = 136243 }
end
world.retailSpells = RETAIL_SPELLS

-- Honor: world.honor = { cur, max, level }, shown in place of XP while world.honor.watched (IsWatchingHonorAsXP) or
-- world.honor.battlefield (C_PvP.IsActiveBattlefield); nil until a test sets it.
world.honor = nil
-- The honor field asked for, or 0 with no honor set.
local function honor(field)
  return world.honor and world.honor[field] or 0
end
-- The player's honor towards the next honor level.
function UnitHonor() return honor("cur") end
-- The honor the next honor level needs.
function UnitHonorMax() return honor("max") end
-- The player's honor level.
function UnitHonorLevel() return honor("level") end
-- Whether honor is watched in place of experience.
function IsWatchingHonorAsXP() return world.honor ~= nil and world.honor.watched == true end
-- Whether the player is in a world PvP zone's battle (never, in the world).
function IsInActiveWorldPVP() return false end
-- Whether the player is in a battleground or arena.
C_PvP.IsActiveBattlefield = function() return world.honor ~= nil and world.honor.battlefield == true end

-- Renown: world.majorFactions[factionID] = { renownLevel, renownReputationEarned, renownLevelThreshold, maxed }.
world.majorFactions = {}
-- Whether a faction is a major faction (one with renown).
C_Reputation.IsMajorFaction = function(id) return world.majorFactions[id] ~= nil end
C_MajorFactions = {
  -- A major faction's renown data, or nil.
  GetMajorFactionData = function(id) return world.majorFactions[id] end,
  -- Whether a major faction is at its top renown level.
  HasMaximumRenown = function(id) return world.majorFactions[id] ~= nil and world.majorFactions[id].maxed == true end,
}

-- Item levels: world.itemLevels[link] (nil for an item without one).
world.itemLevels = {}
-- An item's level, from its link.
C_Item.GetDetailedItemLevelInfo = function(link) return world.itemLevels[link] end

-- Specializations: world.specInfo[index] = { role = "HEALER", primaryStat = LE_UNIT_STAT_INTELLECT } (index from
-- world.spec). Checked against live's SpecializationInfoDocumentation: GetSpecializationInfo returns specId, name,
-- description, icon, role, primaryStat. The LE_UNIT_STAT values are TEST-ONLY.
LE_UNIT_STAT_STRENGTH, LE_UNIT_STAT_AGILITY, LE_UNIT_STAT_INTELLECT = 1, 2, 4
world.specInfo = {}
-- A specialization's id, name, description, icon, role and primary stat.
C_SpecializationInfo.GetSpecializationInfo = function(index)
  local info = world.specInfo[index]
  if not info then return nil end
  return index, "TEST-ONLY Spec", "", 0, info.role, info.primaryStat
end
