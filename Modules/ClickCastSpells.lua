-- What this character can click-cast: the spellbook read into a catalog of
-- spells (ranks folded under one name), sorted into groups a healer thinks in
-- (Heals, Protect & cleanse, Buffs, Other), plus a starter layout per class.
-- Grouping and layouts go by spell name, so they hold across clients; exact
-- ranks come from the spellbook itself. The catalog is rebuilt when spells
-- change. Everything the client may lack is checked before use.

local ADDON, ns = ...

local CS = {}
ns.ClickCastSpells = CS

CS.GROUPS = { "heals", "cleanse", "buffs", "other" }
CS.GROUP_NAMES = { heals = "Heals", cleanse = "Protect & cleanse", buffs = "Buffs", other = "Other" }

-- Per class: the spells of each group, and the starter layout (mouse button -> spell or action).
local CLASSES = {
  PRIEST = {
    heals = { "Lesser Heal", "Heal", "Greater Heal", "Flash Heal", "Renew", "Prayer of Healing", "Holy Nova", "Circle of Healing", "Prayer of Mending", "Binding Heal", "Penance" },
    cleanse = { "Power Word: Shield", "Dispel Magic", "Cure Disease", "Abolish Disease", "Fear Ward", "Pain Suppression", "Guardian Spirit" },
    buffs = { "Power Word: Fortitude", "Divine Spirit", "Shadow Protection", "Prayer of Fortitude", "Prayer of Spirit", "Prayer of Shadow Protection", "Levitate", "Mind Vision" },
    layout = { BUTTON2 = "Flash Heal", ["shift-BUTTON1"] = "Greater Heal", ["shift-BUTTON2"] = "Renew", ["ctrl-BUTTON1"] = "Dispel Magic", ["ctrl-BUTTON2"] = "Cure Disease", ["alt-BUTTON1"] = "Power Word: Shield", ["alt-BUTTON2"] = "Resurrection" },
  },
  DRUID = {
    heals = { "Healing Touch", "Regrowth", "Rejuvenation", "Tranquility", "Swiftmend", "Lifebloom", "Nourish", "Wild Growth" },
    cleanse = { "Remove Curse", "Cure Poison", "Abolish Poison", "Remove Corruption", "Nature's Cure" },
    buffs = { "Mark of the Wild", "Gift of the Wild", "Thorns", "Innervate" },
    layout = { BUTTON2 = "Rejuvenation", ["shift-BUTTON1"] = "Healing Touch", ["shift-BUTTON2"] = "Regrowth", ["ctrl-BUTTON1"] = "Remove Curse", ["ctrl-BUTTON2"] = "Abolish Poison", ["alt-BUTTON1"] = "Swiftmend", ["alt-BUTTON2"] = "Rebirth" },
  },
  PALADIN = {
    heals = { "Holy Light", "Flash of Light", "Lay on Hands", "Holy Shock", "Word of Glory", "Light of Dawn" },
    cleanse = { "Cleanse", "Purify", "Blessing of Protection", "Blessing of Freedom", "Blessing of Sacrifice", "Divine Intervention", "Hand of Protection", "Hand of Freedom", "Hand of Sacrifice" },
    buffs = { "Blessing of Might", "Blessing of Wisdom", "Blessing of Kings", "Blessing of Salvation", "Blessing of Light", "Blessing of Sanctuary", "Greater Blessing of Might", "Greater Blessing of Wisdom", "Greater Blessing of Kings", "Greater Blessing of Salvation", "Greater Blessing of Light", "Greater Blessing of Sanctuary" },
    layout = { BUTTON2 = "Flash of Light", ["shift-BUTTON1"] = "Holy Light", ["shift-BUTTON2"] = "Blessing of Protection", ["ctrl-BUTTON1"] = "Cleanse", ["ctrl-BUTTON2"] = "Purify", ["alt-BUTTON1"] = "Lay on Hands", ["alt-BUTTON2"] = "Redemption" },
  },
  SHAMAN = {
    heals = { "Healing Wave", "Lesser Healing Wave", "Chain Heal", "Riptide", "Healing Surge", "Earth Shield" },
    cleanse = { "Cure Poison", "Cure Disease", "Cure Toxins", "Cleanse Spirit", "Purify Spirit" },
    buffs = { "Water Walking", "Water Breathing" },
    layout = { BUTTON2 = "Lesser Healing Wave", ["shift-BUTTON1"] = "Healing Wave", ["shift-BUTTON2"] = "Chain Heal", ["ctrl-BUTTON1"] = "Cure Poison", ["ctrl-BUTTON2"] = "Cure Disease", ["alt-BUTTON1"] = "Ancestral Spirit", ["alt-BUTTON2"] = "Nature's Swiftness" },
  },
  MAGE = { heals = {}, cleanse = { "Remove Lesser Curse", "Remove Curse" }, buffs = { "Arcane Intellect", "Arcane Brilliance", "Dampen Magic", "Amplify Magic", "Slow Fall" }, layout = { ["shift-BUTTON1"] = "Arcane Intellect", ["ctrl-BUTTON1"] = "Remove Lesser Curse" } },
  WARLOCK = { heals = {}, cleanse = {}, buffs = { "Unending Breath", "Detect Invisibility", "Detect Lesser Invisibility", "Detect Greater Invisibility" }, layout = { ["shift-BUTTON1"] = "Unending Breath" } },
}

-- Every layout targets by plain left click and opens the unit menu on middle click.
local COMMON_LAYOUT = { BUTTON1 = { action = "target" }, BUTTON3 = { action = "menu" } }

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
  return CLASSES[CS.PlayerClass() or ""] or { heals = {}, cleanse = {}, buffs = {}, layout = {} }
end

-- A set of the names in each named group of the class table.
local function groupSets(data)
  local sets = {}
  for _, g in ipairs(CS.GROUPS) do
    sets[g] = {}
    for _, name in ipairs(data[g] or {}) do sets[g][name] = true end
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

-- The starter layout for the player's class as { key = { action, value } }: a spell by name
-- (max rank, inert until learned) or an action, plus target and menu on the plain buttons.
function CS.Layout()
  local out = {}
  for key, b in pairs(COMMON_LAYOUT) do out[key] = { action = b.action } end
  for key, name in pairs(classData().layout) do out[key] = { action = "spell", value = name } end
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
ns.On("LEARNED_SPELL_IN_TAB", CS.Invalidate)
ns.On("PLAYER_ENTERING_WORLD", CS.Invalidate)
