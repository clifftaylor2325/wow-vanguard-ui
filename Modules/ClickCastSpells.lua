-- What this character can click-cast: the spellbook read into a catalog of
-- spells (ranks folded under one name), sorted into groups a healer thinks in
-- (Heals, Protect & cleanse, Buffs, Other), plus a starter layout per class.
-- Groups and layouts list spells by id and take each name from the client, so
-- they hold on every client language; any rank of a spell shares its name, so
-- one id stands for them all, and exact ranks come from the spellbook itself.
-- Later expansions' spells are listed too, for the newer clients the addon loads
-- on; a client that doesn't know an id just leaves it out. The catalog is
-- rebuilt when spells change. Everything the client may lack is checked before use.

local ADDON, ns = ...

local L = ns.L

local CS = {}
ns.ClickCastSpells = CS

CS.GROUPS = { "heals", "cleanse", "buffs", "other" }
CS.GROUP_NAMES = { heals = L["Heals"], cleanse = L["Protect & cleanse"], buffs = L["Buffs"], other = L["Other"] }

-- Per class: the spell ids of each group, and the starter layout (mouse button -> spell id), the main heal on the middle click.
-- The names in the comments are the English client's, for reading only: the client names each id.
-- UNVERIFIED on a Forever client: the ids are the classic database's; check them in the click-casting picker.
CS.CLASSES = ns.ClientData({
  forever = {
    PRIEST = {
      -- Lesser Heal, Heal, Greater Heal, Flash Heal, Renew, Prayer of Healing, Holy Nova, Circle of Healing,
      -- Prayer of Mending, Binding Heal, Penance.
      heals = { 2050, 2054, 2060, 2061, 139, 596, 15237, 34861, 33076, 32546, 47540 },
      -- Power Word: Shield, Dispel Magic, Cure Disease, Abolish Disease, Fear Ward, Pain Suppression, Guardian Spirit.
      cleanse = { 17, 527, 528, 552, 6346, 33206, 47788 },
      -- Power Word: Fortitude, Divine Spirit, Shadow Protection, Prayer of Fortitude, Prayer of Spirit,
      -- Prayer of Shadow Protection, Levitate, Mind Vision.
      buffs = { 1243, 14752, 976, 21562, 27681, 27683, 1706, 2096 },
      -- Flash Heal, Greater Heal, Renew, Dispel Magic, Cure Disease, Power Word: Shield, Resurrection.
      layout = { BUTTON3 = 2061, ["shift-BUTTON1"] = 2060, ["shift-BUTTON2"] = 139, ["ctrl-BUTTON1"] = 527, ["ctrl-BUTTON2"] = 528, ["alt-BUTTON1"] = 17, ["alt-BUTTON2"] = 2006 },
    },
    DRUID = {
      -- Healing Touch, Regrowth, Rejuvenation, Tranquility, Swiftmend, Lifebloom, Nourish, Wild Growth.
      heals = { 5185, 8936, 774, 740, 18562, 33763, 50464, 48438 },
      -- Remove Curse (Remove Corruption on later clients), Cure Poison, Abolish Poison, Nature's Cure.
      cleanse = { 2782, 8946, 2893, 88423 },
      -- Mark of the Wild, Gift of the Wild, Thorns, Innervate.
      buffs = { 1126, 21849, 467, 29166 },
      -- Rejuvenation, Healing Touch, Regrowth, Remove Curse, Abolish Poison, Swiftmend, Rebirth.
      layout = { BUTTON3 = 774, ["shift-BUTTON1"] = 5185, ["shift-BUTTON2"] = 8936, ["ctrl-BUTTON1"] = 2782, ["ctrl-BUTTON2"] = 2893, ["alt-BUTTON1"] = 18562, ["alt-BUTTON2"] = 20484 },
    },
    PALADIN = {
      -- Holy Light, Flash of Light, Lay on Hands, Holy Shock, Word of Glory, Light of Dawn.
      heals = { 635, 19750, 633, 20473, 85673, 85222 },
      -- Cleanse, Purify, Blessing of Protection, Blessing of Freedom, Blessing of Sacrifice (the three Hand of ...
      -- on later clients), Divine Intervention.
      cleanse = { 4987, 1152, 1022, 1044, 6940, 19752 },
      -- Blessing of Might, Wisdom, Kings, Salvation, Light, Sanctuary, then the Greater Blessing of each.
      buffs = { 19740, 19742, 20217, 1038, 19977, 20911, 25782, 25894, 25898, 25895, 25890, 25899 },
      -- Flash of Light, Holy Light, Blessing of Protection, Cleanse, Purify, Lay on Hands, Redemption.
      layout = { BUTTON3 = 19750, ["shift-BUTTON1"] = 635, ["shift-BUTTON2"] = 1022, ["ctrl-BUTTON1"] = 4987, ["ctrl-BUTTON2"] = 1152, ["alt-BUTTON1"] = 633, ["alt-BUTTON2"] = 7328 },
    },
    SHAMAN = {
      -- Healing Wave, Lesser Healing Wave (Healing Surge on later clients), Chain Heal, Riptide, Earth Shield.
      heals = { 331, 8004, 1064, 61295, 974 },
      -- Cure Poison (Cure Toxins on later clients), Cure Disease, Cleanse Spirit, Purify Spirit.
      cleanse = { 526, 2870, 51886, 77130 },
      -- Water Walking, Water Breathing.
      buffs = { 546, 131 },
      -- Lesser Healing Wave, Healing Wave, Chain Heal, Cure Poison, Cure Disease, Ancestral Spirit, Nature's Swiftness.
      layout = { BUTTON3 = 8004, ["shift-BUTTON1"] = 331, ["shift-BUTTON2"] = 1064, ["ctrl-BUTTON1"] = 526, ["ctrl-BUTTON2"] = 2870, ["alt-BUTTON1"] = 2008, ["alt-BUTTON2"] = 16188 },
    },
    -- Remove Lesser Curse (Remove Curse on later clients); Arcane Intellect, Arcane Brilliance, Dampen Magic, Amplify Magic,
    -- Slow Fall; the layout: Arcane Intellect, Remove Lesser Curse.
    MAGE = { heals = {}, cleanse = { 475 }, buffs = { 1459, 23028, 604, 1008, 130 }, layout = { ["shift-BUTTON1"] = 1459, ["ctrl-BUTTON1"] = 475 } },
    -- Unending Breath, Detect Invisibility, Detect Lesser Invisibility, Detect Greater Invisibility; the layout: Unending Breath.
    WARLOCK = { heals = {}, cleanse = {}, buffs = { 5697, 2970, 132, 11743 }, layout = { ["shift-BUTTON1"] = 5697 } },
  },
  -- Retail's thirteen classes, the healers' current spells by their Retail ids (12.1.5). UNVERIFIED on a Retail
  -- client: typed from the live database; scripts/lib/wow-retail-data.lua names each, and the PR lists them to /dump.
  retail = {
    PRIEST = {
      -- Flash Heal, Heal, Renew, Prayer of Healing, Holy Word: Serenity, Holy Word: Sanctify, Prayer of Mending,
      -- Penance, Power Word: Radiance, Circle of Healing, Halo, Divine Hymn, Power Word: Life.
      heals = { 2061, 2060, 139, 596, 2050, 34861, 33076, 47540, 194509, 204883, 120517, 64843, 373481 },
      -- Power Word: Shield, Purify, Purify Disease, Pain Suppression, Guardian Spirit, Leap of Faith, Power Infusion.
      cleanse = { 17, 527, 213634, 33206, 47788, 73325, 10060 },
      -- Power Word: Fortitude, Levitate.
      buffs = { 21562, 1706 },
      -- Flash Heal, Heal, Renew, Purify, Prayer of Mending, Power Word: Shield, Resurrection.
      layout = { BUTTON3 = 2061, ["shift-BUTTON1"] = 2060, ["shift-BUTTON2"] = 139, ["ctrl-BUTTON1"] = 527, ["ctrl-BUTTON2"] = 33076, ["alt-BUTTON1"] = 17, ["alt-BUTTON2"] = 2006 },
    },
    DRUID = {
      -- Rejuvenation, Regrowth, Wild Growth, Swiftmend, Lifebloom, Tranquility, Efflorescence, Cenarion Ward, Nourish,
      -- Invigorate, Grove Guardians, Overgrowth.
      heals = { 774, 8936, 48438, 18562, 33763, 740, 145205, 102351, 50464, 392160, 102693, 203651 },
      -- Nature's Cure, Remove Corruption, Ironbark.
      cleanse = { 88423, 2782, 102342 },
      -- Mark of the Wild, Innervate.
      buffs = { 1126, 29166 },
      -- Rejuvenation, Regrowth, Wild Growth, Nature's Cure, Lifebloom, Swiftmend, Rebirth.
      layout = { BUTTON3 = 774, ["shift-BUTTON1"] = 8936, ["shift-BUTTON2"] = 48438, ["ctrl-BUTTON1"] = 88423, ["ctrl-BUTTON2"] = 33763, ["alt-BUTTON1"] = 18562, ["alt-BUTTON2"] = 20484 },
    },
    PALADIN = {
      -- Flash of Light, Holy Light, Holy Shock, Word of Glory, Light of Dawn, Lay on Hands, Holy Prism, Barrier of Faith,
      -- Light's Hammer.
      heals = { 19750, 82326, 20473, 85673, 85222, 633, 114165, 148039, 114158 },
      -- Cleanse, Cleanse Toxins, Blessing of Protection, Blessing of Freedom, Blessing of Sacrifice, Blessing of
      -- Spellwarding, Beacon of Light, Beacon of Faith.
      cleanse = { 4987, 213644, 1022, 1044, 6940, 204018, 53563, 156910 },
      buffs = {},
      -- Flash of Light, Holy Light, Word of Glory, Cleanse, Blessing of Freedom, Lay on Hands, Redemption.
      layout = { BUTTON3 = 19750, ["shift-BUTTON1"] = 82326, ["shift-BUTTON2"] = 85673, ["ctrl-BUTTON1"] = 4987, ["ctrl-BUTTON2"] = 1044, ["alt-BUTTON1"] = 633, ["alt-BUTTON2"] = 7328 },
    },
    SHAMAN = {
      -- Healing Surge, Healing Wave, Chain Heal, Riptide, Earth Shield, Healing Rain, Unleash Life, Wellspring.
      heals = { 8004, 77472, 1064, 61295, 974, 73920, 73685, 197995 },
      -- Purify Spirit, Cleanse Spirit.
      cleanse = { 77130, 51886 },
      -- Skyfury, Water Walking.
      buffs = { 462854, 546 },
      -- Healing Surge, Healing Wave, Chain Heal, Purify Spirit, Riptide, Earth Shield, Ancestral Spirit.
      layout = { BUTTON3 = 8004, ["shift-BUTTON1"] = 77472, ["shift-BUTTON2"] = 1064, ["ctrl-BUTTON1"] = 77130, ["ctrl-BUTTON2"] = 61295, ["alt-BUTTON1"] = 974, ["alt-BUTTON2"] = 2008 },
    },
    MONK = {
      -- Vivify, Renewing Mist, Enveloping Mist, Soothing Mist, Life Cocoon, Revival, Sheilun's Gift.
      heals = { 116670, 115151, 124682, 115175, 116849, 115310, 399491 },
      -- Detox (Mistweaver's), Detox (Brewmaster's and Windwalker's), Tiger's Lust.
      cleanse = { 115450, 218164, 116841 },
      buffs = {},
      -- Vivify, Enveloping Mist, Renewing Mist, Detox, Life Cocoon, Soothing Mist, Resuscitate.
      layout = { BUTTON3 = 116670, ["shift-BUTTON1"] = 124682, ["shift-BUTTON2"] = 115151, ["ctrl-BUTTON1"] = 115450, ["ctrl-BUTTON2"] = 116849, ["alt-BUTTON1"] = 115175, ["alt-BUTTON2"] = 115178 },
    },
    EVOKER = {
      -- Living Flame, Emerald Blossom, Verdant Embrace, Dream Breath, Spiritbloom, Reversion, Echo, Temporal Anomaly.
      heals = { 361469, 355913, 360995, 355936, 367226, 366155, 364343, 373861 },
      -- Naturalize, Expunge, Cauterizing Flame, Time Dilation, Rescue.
      cleanse = { 360823, 365585, 374251, 357170, 370665 },
      -- Blessing of the Bronze, Source of Magic.
      buffs = { 364342, 369459 },
      -- Living Flame, Echo, Reversion, Naturalize, Verdant Embrace, Emerald Blossom, Return.
      layout = { BUTTON3 = 361469, ["shift-BUTTON1"] = 364343, ["shift-BUTTON2"] = 366155, ["ctrl-BUTTON1"] = 360823, ["ctrl-BUTTON2"] = 360995, ["alt-BUTTON1"] = 355913, ["alt-BUTTON2"] = 361227 },
    },
    -- Remove Curse; Arcane Intellect, Slow Fall; the layout: Arcane Intellect, Remove Curse.
    MAGE = { heals = {}, cleanse = { 475 }, buffs = { 1459, 130 }, layout = { ["shift-BUTTON1"] = 1459, ["ctrl-BUTTON1"] = 475 } },
    -- Unending Breath, Soulstone; the layout: Unending Breath, Soulstone.
    WARLOCK = { heals = {}, cleanse = {}, buffs = { 5697, 20707 }, layout = { ["shift-BUTTON1"] = 5697, ["ctrl-BUTTON1"] = 20707 } },
    -- Intervene; Battle Shout; the layout: Intervene.
    WARRIOR = { heals = {}, cleanse = { 3411 }, buffs = { 6673 }, layout = { ["shift-BUTTON1"] = 3411 } },
    -- The layout: Raise Ally.
    DEATHKNIGHT = { heals = {}, cleanse = {}, buffs = {}, layout = { ["alt-BUTTON2"] = 61999 } },
    -- The layout: Misdirection.
    HUNTER = { heals = {}, cleanse = {}, buffs = {}, layout = { ["shift-BUTTON1"] = 34477 } },
    -- The layout: Tricks of the Trade.
    ROGUE = { heals = {}, cleanse = {}, buffs = {}, layout = { ["shift-BUTTON1"] = 57934 } },
    -- Nothing a demon hunter casts on a friend: target and menu only.
    DEMONHUNTER = { heals = {}, cleanse = {}, buffs = {}, layout = {} },
  },
})

-- Every layout is "Click to select": plain left click targets and plain right click opens the unit menu. These are the
-- clicks the game's own click profile covers by default, and the units' click handler drops a Target or Unit menu
-- click it doesn't cover, so the menu can't sit on Middle. A class's main heal takes the middle click.
local COMMON_LAYOUT = { BUTTON1 = { action = "target" }, BUTTON2 = { action = "menu" } }

-- Catalog -------------------------------------------------------------------------------------

local catalog

-- Whether the client answers a call: the table and function both exist.
local function has(tbl, name)
  return type(tbl) == "table" and type(tbl[name]) == "function"
end

-- A spellbook entry's details through C_Spell (name, icon), or nil when unknown.
local function details(id)
  local info = has(C_Spell, "GetSpellInfo") and C_Spell.GetSpellInfo(id)
  if type(info) ~= "table" or type(info.name) ~= "string" then return nil end
  return info.name, info.iconID
end

-- A spell's rank number from its subtext ("Rank 3"), or nil for unranked spells.
local function rankOf(subtext)
  return type(subtext) == "string" and tonumber(subtext:match("(%d+)")) or nil
end

-- Whether a spellbook item is a castable, learned, on-spec spell (not a passive, flyout or off-spec entry).
local function castable(item)
  if type(item) ~= "table" or item.isPassive or item.isOffSpec then return false end
  local kind = Enum and Enum.SpellBookItemType and Enum.SpellBookItemType.Spell
  return item.itemType == kind or item.itemType == nil
end

-- A book item as a catalog entry { spellID, name, rank, icon }, or nil when it isn't a castable spell.
local function entry(item)
  if not castable(item) then return nil end
  local name, icon = details(item.spellID)
  if not name then return nil end
  return { spellID = item.spellID, name = name, icon = icon, rank = rankOf(item.subName) }
end

-- The entries of one skill line (a spellbook tab) appended to out.
local function lineItems(out, line, bank)
  local info = C_SpellBook.GetSpellBookSkillLineInfo(line)
  local first = (type(info) == "table" and info.itemIndexOffset or 0) + 1
  for i = first, first + (type(info) == "table" and info.numSpellBookItems or 0) - 1 do
    out[#out + 1] = entry(C_SpellBook.GetSpellBookItemInfo(i, bank))
  end
end

-- The player's spellbook as catalog entries, from the C_SpellBook skill lines.
local function bookItems()
  local out, bank = {}, Enum and Enum.SpellBookSpellBank and Enum.SpellBookSpellBank.Player or 0
  for line = 1, C_SpellBook.GetNumSpellBookSkillLines() do lineItems(out, line, bank) end
  return out
end

-- Whether the client has the spellbook calls the catalog reads.
local function hasSpellbook()
  return has(C_SpellBook, "GetNumSpellBookSkillLines") and has(C_SpellBook, "GetSpellBookSkillLineInfo") and has(C_SpellBook, "GetSpellBookItemInfo")
end

-- Adds a book item to its spell (one per name), keeping the ranks and the highest-rank id.
local function fold(spells, byName, item)
  local s = byName[item.name]
  if not s then
    s = { name = item.name, icon = item.icon, spellID = item.spellID, ranks = {} }
    byName[item.name], spells[#spells + 1] = s, s
  end
  if item.rank then s.ranks[#s.ranks + 1] = { rank = item.rank, spellID = item.spellID } end
  if item.rank and item.rank >= (s.maxRank or 0) then s.maxRank, s.spellID, s.icon = item.rank, item.spellID, item.icon end
end

-- Puts a spell's ranks in order.
local function sortRanks(s)
  table.sort(s.ranks, function(a, b) return a.rank < b.rank end)
end

-- Builds the catalog: spells by name with their ranks, in spellbook order.
local function build()
  local spells, byName = {}, {}
  local ok, items = false, nil
  if hasSpellbook() then ok, items = ns.Try("ClickCast spellbook", bookItems) end
  for _, item in ipairs(ok and items or {}) do fold(spells, byName, item) end
  for _, s in ipairs(spells) do sortRanks(s) end
  return { spells = spells, byName = byName }
end

-- The catalog, built on first use and after the spellbook changes.
function CS.Catalog()
  catalog = catalog or build()
  return catalog
end

-- Forgets the catalog so the next read rebuilds it.
function CS.Invalidate()
  catalog = nil
end

-- The catalog spell with this name, or nil.
function CS.Spell(name)
  return CS.Catalog().byName[name]
end

-- Groups --------------------------------------------------------------------------------------

-- The player's class token ("PRIEST"), or nil where the client can't say.
function CS.PlayerClass()
  if type(UnitClass) ~= "function" then return nil end
  local _, token = UnitClass("player")
  return type(token) == "string" and token or nil
end

-- The class table for the player's class (empty for classes without one).
local function classData()
  return CS.CLASSES[CS.PlayerClass() or ""] or { heals = {}, cleanse = {}, buffs = {}, layout = {} }
end

-- A set of the client's names for the spells in each named group of the class table.
local function groupSets(data)
  local sets = {}
  for _, g in ipairs(CS.GROUPS) do
    sets[g] = {}
    for _, name in ipairs(ns.SpellNames(data[g] or {})) do sets[g][name] = true end
  end
  return sets
end

-- Whether the client says the spell is cast on friends (C_Spell.IsSpellHelpful), or nil when it can't say.
local function helpful(id)
  if not has(C_Spell, "IsSpellHelpful") then return nil end
  local ok, v = pcall(C_Spell.IsSpellHelpful, id)
  return ok and v == true or false
end

-- The group a spell belongs to: its class group by name, else "other" (or nil when the client says it's not castable on friends).
local function groupOf(sets, s)
  for _, g in ipairs(CS.GROUPS) do
    if sets[g][s.name] then return g end
  end
  if helpful(s.spellID) == false then return nil end
  return "other"
end

-- The catalog sorted into groups: { heals = { spell... }, cleanse = ..., buffs = ..., other = ... }.
function CS.Groups()
  local sets, groups = groupSets(classData()), {}
  for _, g in ipairs(CS.GROUPS) do groups[g] = {} end
  for _, s in ipairs(CS.Catalog().spells) do
    local g = groupOf(sets, s)
    if g then table.insert(groups[g], s) end
  end
  return groups
end

-- Layouts ---------------------------------------------------------------------------------------

-- The starter layout for the player's class as { key = { action, value } }: a spell by the client's
-- name for it (max rank, inert until learned) or an action, plus target and menu on the plain buttons.
-- A spell the client has no name for is left out.
function CS.Layout()
  local out = {}
  for key, b in pairs(COMMON_LAYOUT) do out[key] = { action = b.action } end
  for key, id in pairs(classData().layout) do
    local name = ns.SpellName(id)
    if name then out[key] = { action = "spell", value = name } end
  end
  return out
end

-- Whether the player's class has a starter layout beyond target and menu.
function CS.HasLayout()
  return next(classData().layout) ~= nil
end

-- A readable class name for the layout button ("Priest"), from the client or the token.
function CS.ClassName()
  local name = type(UnitClass) == "function" and (UnitClass("player"))
  if type(name) == "string" then return name end
  local token = CS.PlayerClass() or "Class"
  return token:sub(1, 1) .. token:sub(2):lower()
end

-- The spellbook changed: rebuild the catalog next time it's read.
ns.On("SPELLS_CHANGED", CS.Invalidate)
ns.On("LEARNED_SPELL_IN_SKILL_LINE", CS.Invalidate)
ns.On("PLAYER_ENTERING_WORLD", CS.Invalidate)
