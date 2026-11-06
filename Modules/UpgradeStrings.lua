-- Weight strings from guide sites, written for other stat weight tools (Gear upgrades' Import takes them beside its
-- own): ( Tool: v1: "Name": Class=Druid, SpellDamage=1, CritRating=10, ... ). Only the class and the stats Vanguard
-- weighs are read; the tool's name in front is never looked at.

local ADDON, ns = ...

local W = ns.UpgradeWeights

local S = {}
ns.UpgradeStrings = S

-- The strings' stat names (lower case) -> Vanguard's short names. Several name one stat (spell damage, healing and
-- spell power are all SP): the biggest weight among them wins.
S.NAMES = {
  strength = "STR", agility = "AGI", stamina = "STA", intellect = "INT", spirit = "SPI", armor = "ARMOR",
  ap = "AP", rap = "RAP", spelldamage = "SP", spellpower = "SP", healing = "SP", mp5 = "MP5",
  critrating = "CRIT", spellcritrating = "CRIT", hitrating = "HIT", spellhitrating = "HIT",
  hasterating = "HASTE", spellhasterating = "HASTE", expertiserating = "EXP", armorpenetration = "ARP",
  defenserating = "DEF", dodgerating = "DODGE", parryrating = "PARRY", blockrating = "BLOCK", blockvalue = "BLOCKVALUE",
  dps = "DPS", meleedps = "DPS", rangeddps = "DPS", masteryrating = "MASTERY", versatility = "VERS",
}

-- The names that say whom a string is for, not what a stat is worth (never listed as skipped).
S.ABOUT = { class = true, spec = true }

-- The Name=value pairs of a guide string, or nil for text that isn't one.
local function body(text)
  return type(text) == "string" and text:match('^%s*%(%s*[%w_]+%s*:%s*v%d+%s*:%s*".-"%s*:(.*)%)%s*$') or nil
end

-- Reads one Name=value pair into out: the class, a stat Vanguard weighs (the biggest weight when names share it),
-- or a name it skips.
local function addPair(out, name, value)
  local key = name:lower()
  if key == "class" then out.class = value:upper() return end
  local short, n = S.NAMES[key], ns.GetModule("Upgrades").ParseWeight(value)
  local known = short and W.STATS[short] and n
  if known then out.weights[short] = math.max(out.weights[short] or n, n) return end
  if not S.ABOUT[key] then out.skipped[#out.skipped + 1] = name end
end

-- A guide string read: { class = "DRUID" (nil when it names none), weights = { SP = 1, ... }, skipped = { names } },
-- or nil for text that isn't one.
function S.Parse(text)
  local pairsText = body(text)
  if not pairsText then return nil end
  local out = { weights = {}, skipped = {} }
  for name, value in pairsText:gmatch("([%w_]+)%s*=%s*([^,%s]+)") do addPair(out, name, value) end
  return out
end
