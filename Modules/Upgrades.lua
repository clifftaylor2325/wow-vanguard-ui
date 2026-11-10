-- Gear upgrades: how an item compares with what you wear, by stat weights for
-- your class and role (Modules/UpgradeWeights.lua). An item's tooltip says
-- "Upgrade +12% (estimate) vs <worn item>" (or a drop), an arrow marks upgrades in the
-- combined bag, and on quest reward cards. Rings, trinkets compare with the
-- weaker of the two you wear, a one-hand weapon too while you wear one in each hand; a two-hander with both hands; an empty slot is
-- always an upgrade, except the off hand beside a two-hander (an off-hand item gets no verdict there). Gear you can't wear is left alone.
--
-- /vg weights shows the weights in use; set <stat> <n>, reset, export and
-- import change or share them (a profile keeps its own, per class). On WoW
-- Forever a druid or shaman picks a damage style, and hit, expertise and
-- defense past their caps (set in the wizard) are worth nothing.
--
-- Written for WoW Forever: C_Item.GetItemStats, GetItemInfoInstant and
-- IsEquippableItem and C_PlayerInfo.CanUseItem are in its UI source (1.60.1).
-- The tooltip's text is never read.

local ADDON, ns = ...
local L = ns.L

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgUpgrade = ns.FrameState("vgUpgrade")

local T = ns.Theme
local W = ns.UpgradeWeights


-- weights: class -> kind -> this profile's changes to the defaults; caps: class -> kind -> stat -> its cap where it
-- differs from the kind's (ns.UpgradeWeights.CAPS; 0 for none);
-- styles: class -> its damage style on WoW Forever (ns.UpgradeWeights.STYLES).
local UP = ns.Module("Upgrades", { live = true, defaults = { tooltip = true, bags = true, quests = true, role = "auto", weights = {}, caps = {}, styles = {} } })

-- Moves weights kept per kind ({ strength = { ... } }, as a profile had them before they were kept per class) to
-- every class that uses the kind, so a shared profile keeps what each class had.
local function perClass(weights)
  local legacy = {}
  for kind, changes in pairs(weights) do if W.KINDS[kind] and type(changes) == "table" then legacy[kind] = changes end end
  for kind, changes in pairs(legacy) do
    weights[kind] = nil
    for class in pairs(W.ClassesOf(kind)) do
      weights[class] = weights[class] or {}
      weights[class][kind] = ns.Copy(changes)
    end
  end
end

-- Weights kept per kind become weights kept per class (perClass).
ns.Migrate("Upgrades", function(saved)
  if type(saved.weights) == "table" then perClass(saved.weights) end
end)

-- A change smaller than this (per cent) isn't shown.
UP.MIN_PCT = 0.5
-- The inventory slots of the main hand and the off hand (a two-hander fills both).
UP.MAIN_HAND, UP.OFF_HAND = 16, 17
-- The last equipment slot (the tabard): the slots 1 to this one hold what you wear.
UP.LAST_WORN_SLOT = 19
-- Equip locations -> the inventory slots they go in (a pair compares with the weaker).
UP.SLOTS = {
  INVTYPE_HEAD = { 1 }, INVTYPE_NECK = { 2 }, INVTYPE_SHOULDER = { 3 }, INVTYPE_CHEST = { 5 }, INVTYPE_ROBE = { 5 },
  INVTYPE_WAIST = { 6 }, INVTYPE_LEGS = { 7 }, INVTYPE_FEET = { 8 }, INVTYPE_WRIST = { 9 }, INVTYPE_HAND = { 10 },
  INVTYPE_FINGER = { 11, 12 }, INVTYPE_TRINKET = { 13, 14 }, INVTYPE_CLOAK = { 15 },
  INVTYPE_WEAPON = { 16 }, INVTYPE_WEAPONMAINHAND = { 16 }, INVTYPE_2HWEAPON = { 16 },
  INVTYPE_WEAPONOFFHAND = { 17 }, INVTYPE_SHIELD = { 17 }, INVTYPE_HOLDABLE = { 17 },
}

-- Ranged weapons: WoW Forever has a ranged slot (18). Retail has none and wears a bow, gun or crossbow in the
-- main hand, with no thrown or relic slot.
UP.RANGED_SLOTS = ns.ClientData({
  forever = { INVTYPE_RANGED = { 18 }, INVTYPE_RANGEDRIGHT = { 18 }, INVTYPE_THROWN = { 18 }, INVTYPE_RELIC = { 18 } },
  retail = { INVTYPE_RANGED = { 16 }, INVTYPE_RANGEDRIGHT = { 16 } },
})
for loc, slots in pairs(UP.RANGED_SLOTS) do UP.SLOTS[loc] = slots end

-- The equip locations that take both hands, compared with both hands together (a Retail ranged weapon is one).
UP.TWO_HANDED = ns.ClientData({
  forever = { INVTYPE_2HWEAPON = true },
  retail = { INVTYPE_2HWEAPON = true, INVTYPE_RANGED = true, INVTYPE_RANGEDRIGHT = true },
})

-- The equip locations of a weapon worn in either hand: compared with the weaker hand while a weapon is in each.
UP.ONE_HAND = { INVTYPE_WEAPON = true }

-- The equip locations that go in the off hand only: a weapon made for it, a shield, a held item.
UP.OFF_HAND_ONLY = { INVTYPE_WEAPONOFFHAND = true, INVTYPE_SHIELD = true, INVTYPE_HOLDABLE = true }

-- The equip locations of a main-hand item that leaves no room for an off hand. Retail's INVTYPE_RANGEDRIGHT is
-- left out on purpose: a wand shares it with guns and crossbows and takes one hand.
UP.FILLS_BOTH_HANDS = ns.ClientData({
  forever = { INVTYPE_2HWEAPON = true },
  retail = { INVTYPE_2HWEAPON = true, INVTYPE_RANGED = true },
})

-- Weights ---------------------------------------------------------------------------------

-- The role weights are picked for: the setting, else (auto) your group role, else (on Retail) your specialization's
-- role, damage when you have none.
function UP.Role()
  if UP.settings.role ~= "auto" then return UP.settings.role end
  return ns.GroupRole() or W.SpecRole() or "damage"
end

-- What the lines call each kind of character, each role and each damage style (the keys of
-- ns.UpgradeWeights.KINDS, of a class's roles and of STYLES; Balance is both a kind and a style).
UP.WORDS = {
  strength = L["strength"], agility = L["agility"], caster = L["caster"],
  damage = L["damage"], tank = L["tank"], healer = L["healer"],
  feral = L["Feral"], balance = L["Balance"], elemental = L["Elemental"], enhancement = L["Enhancement"],
}

-- A kind or a role as the lines name it (the key itself for one not listed).
---@param key string
---@return string
function UP.Word(key)
  return UP.WORDS[key] or key
end

-- Your class, as the client names it (WARRIOR).
function UP.Class()
  return (select(2, UnitClass("player")))
end

-- This profile's changes to a kind's weights for your class (nil: the defaults).
function UP.Own(kind)
  return (UP.settings.weights[UP.Class()] or {})[kind]
end

-- Keeps changes to a kind's weights for your class (nil: back to the defaults).
function UP.SetOwn(kind, changes)
  local all, class = UP.settings.weights, UP.Class()
  all[class] = all[class] or {}
  all[class][kind] = changes
end

-- The cap on a stat (W.CAP_STATS) for a kind, for your class: this profile's, else the kind's (0: none).
function UP.Cap(kind, short)
  local own = ((UP.settings.caps[UP.Class()] or {})[kind] or {})[short]
  return own or (W.CAPS[kind] or {})[short] or 0
end

-- Sets the cap on a stat for a kind, for your class (0 or less: none; the kind's own cap keeps nothing saved).
function UP.SetCap(kind, short, cap)
  local all, class = UP.settings.caps, UP.Class()
  all[class] = all[class] or {}
  all[class][kind] = all[class][kind] or {}
  cap = math.max(0, cap)
  all[class][kind][short] = cap ~= ((W.CAPS[kind] or {})[short] or 0) and cap or nil
end

-- Every cap for a kind back to the kind's own.
function UP.ResetCaps(kind)
  local mine = UP.settings.caps[UP.Class()]
  if mine then mine[kind] = nil end
end

-- Your damage style on WoW Forever (a druid's Feral or Balance), nil for a class with none.
function UP.Style()
  local class = UP.Class()
  return W.Style(class, UP.settings.styles[class])
end

-- Picks your damage style and scores gear afresh.
function UP.SetStyle(style)
  UP.settings.styles[UP.Class()] = style
  UP.Changed()
end

-- The weights in use (the defaults with this profile's changes for your class) and the kind of character they're for.
function UP.Weights()
  local kind = W.Kind(UP.Class(), UP.Role(), UP.Style())
  local out = ns.Copy(W.KINDS[kind])
  -- Only the stats this client weighs, as finite numbers: a profile made on the other client keeps that client's
  -- stats (Retail's ILVL, MASTERY, VERS), which would score this client's items by item level. The saved table
  -- stays as it is, so the profile still works back there.
  for short, value in pairs(UP.Own(kind) or {}) do
    local weight = W.STATS[short] and UP.Weight(value)
    if weight then out[short] = weight end
  end
  return out, kind
end

-- The weights changed (role, a command, login): items are scored afresh, with the
-- weights read again when next needed (not on the event itself).
function UP.Changed()
  if not UP.settings then return end
  UP.current, UP.kind, UP.scores = nil, nil, {}
end

-- The weights in use and their kind, read now if they changed since.
function UP.Current()
  if not UP.current then UP.current, UP.kind = UP.Weights() end
  return UP.current, UP.kind
end

-- Scoring ---------------------------------------------------------------------------------

-- An item's level from the client (C_Item.GetDetailedItemLevelInfo), or nil when it can't say.
local function itemLevel(link)
  local get = type(C_Item) == "table" and C_Item.GetDetailedItemLevelInfo
  return type(get) == "function" and ns.PlainNumber((get(link))) or nil
end

-- What an item is worth with weights: weight x amount, summed over its stats (0 for none), plus its item level
-- where the weights count it (Retail's ILVL; no item stat key holds it). nil while the client has no stats for
-- the item yet (it isn't loaded), so nothing is judged, or remembered, on a guess.
function UP.Score(link, weights)
  local score, stats = 0, C_Item.GetItemStats(link)
  if not stats then return nil end
  for key, amount in pairs(stats) do
    local w, n = weights[W.SHORT[key]], ns.PlainNumber(amount)
    if w and n then score = score + w * n end
  end
  local level = weights.ILVL and itemLevel(link)
  return level and score + weights.ILVL * level or score
end

-- An item's score with the weights in use, remembered until they change (a number only: nil while its stats
-- haven't loaded, so the next look asks again).
local function score(link)
  local known = UP.scores[link]
  if known then return known end
  UP.scores[link] = UP.Score(link, (UP.Current()))
  return UP.scores[link]
end

-- The score of what's worn in an inventory slot (0 when empty, nil while its stats haven't loaded), and whether
-- it's empty.
local function equipped(slot)
  local link = GetInventoryItemLink("player", slot)
  if not link then return 0, true end
  return score(link), false
end

-- The weakest worn item among slots: its score (nil when a worn one has no stats yet, so nothing is judged
-- against a guess), whether a slot is empty, and its link.
local function weakest(slots)
  local low, at, unloaded
  for _, slot in ipairs(slots) do
    local s, empty = equipped(slot)
    if empty then return 0, true, nil end
    if not s then unloaded = slot elseif not low or s < low then low, at = s, slot end
  end
  if unloaded then return nil, false, GetInventoryItemLink("player", unloaded) end
  return low, false, GetInventoryItemLink("player", at)
end

-- What both hands are worth together, for a two-hander: main hand plus off hand (nil while either has no stats).
local function bothHands()
  local mh, empty = equipped(UP.MAIN_HAND)
  local oh = equipped(UP.OFF_HAND)
  return mh and oh and mh + oh, empty, GetInventoryItemLink("player", UP.MAIN_HAND)
end

-- Whether you can wear the item (the client's answers, where it has them).
local function usable(link)
  if C_Item.IsEquippableItem and not C_Item.IsEquippableItem(link) then return false end
  local can = C_PlayerInfo and C_PlayerInfo.CanUseItem
  return type(can) ~= "function" or can((C_Item.GetItemInfoInstant(link))) ~= false
end

-- Whether this client can say what items are and what you wear.
local function canCompare()
  local item = type(C_Item) == "table" and C_Item or {}
  return type(item.GetItemStats) == "function" and type(item.GetItemInfoInstant) == "function" and type(GetInventoryItemLink) == "function"
end

-- Whether a weapon is worn in the off hand (a shield, a held item or nothing is not).
local function offHandWeapon()
  local link = GetInventoryItemLink("player", UP.OFF_HAND)
  local loc = link and select(4, C_Item.GetItemInfoInstant(link))
  return loc == "INVTYPE_WEAPON" or loc == "INVTYPE_WEAPONOFFHAND"
end

-- Whether a two-hander is worn with nothing in the off hand: the empty slot is not one an off-hand item can fill.
local function twoHanderAlone()
  if GetInventoryItemLink("player", UP.OFF_HAND) then return false end
  local link = GetInventoryItemLink("player", UP.MAIN_HAND)
  return link ~= nil and UP.FILLS_BOTH_HANDS[select(4, C_Item.GetItemInfoInstant(link))] == true
end

-- What an item of equip location loc is compared with: both hands for a two-hander, the weaker hand for a
-- one-hander while a weapon is worn in each, else the weakest of its slots. An off-hand item beside a two-hander
-- worn alone has nothing to be compared with (nil, and not an empty slot): it would need a main hand to go with it.
local function wornScore(loc, slots)
  if UP.TWO_HANDED[loc] then return bothHands() end
  if UP.ONE_HAND[loc] and offHandWeapon() then return weakest({ UP.MAIN_HAND, UP.OFF_HAND }) end
  if UP.OFF_HAND_ONLY[loc] and twoHanderAlone() then return nil, false, nil end
  return weakest(slots)
end

-- Caps ------------------------------------------------------------------------------------

-- The combat rating a capped stat is counted from for a kind (a caster's hit is spell hit).
local function ratingOf(short, kind)
  local key = (short == "HIT" and W.SPELL_KINDS[kind]) and "SPELLHIT" or short
  return W.CAP_RATING[key]
end

-- How much rating makes one unit (1%, or a point of defense) of a capped stat for you now: the client's own ratio
-- (GetCombatRating over GetCombatRatingBonus) while you have some of that rating, as it changes with level, else the
-- level-60 table (W.RATING_PER_UNIT).
function UP.PerUnit(short, kind)
  local cr = ratingOf(short, kind)
  local rating = type(GetCombatRating) == "function" and ns.PlainNumber(GetCombatRating(cr))
  local bonus = rating and rating > 0 and type(GetCombatRatingBonus) == "function" and ns.PlainNumber(GetCombatRatingBonus(cr))
  if bonus and bonus > 0 then return rating / bonus end
  return W.RATING_PER_UNIT[short]
end

-- Your hit now, per cent, summed as WoW Forever's character sheet sums it (PaperDollFrameStats.lua): the hit rating's
-- bonus plus the hit modifier, spell hit for a kind that casts, melee hit for the rest.
local function hitNow(kind)
  local read = W.SPELL_KINDS[kind] and GetSpellHitModifier or GetHitModifier
  local hit = type(read) == "function" and ns.PlainNumber(read())
  local bonus = type(GetCombatRatingBonus) == "function" and ns.PlainNumber(GetCombatRatingBonus(ratingOf("HIT", kind)))
  return hit and hit + (bonus or 0) or nil
end

-- Your main hand's expertise now, per cent, as the character sheet shows it (GetExpertise).
local function expertiseNow()
  return type(GetExpertise) == "function" and ns.PlainNumber((GetExpertise())) or nil
end

-- Your defense skill now, base plus bonus, as the character sheet adds it (UnitDefenseSkill).
local function defenseNow()
  if type(UnitDefenseSkill) ~= "function" then return nil end
  local base, bonus = UnitDefenseSkill("player")
  base, bonus = ns.PlainNumber(base), ns.PlainNumber(bonus)
  return base and base + (bonus or 0) or nil
end

-- How much of each capped stat you have now (nil when the client can't say or hides it: the 12.1 client can make
-- these secret).
UP.NOW = { HIT = hitNow, EXP = expertiseNow, DEF = defenseNow }

-- An item's rating in a stat (0 for none, no link, or stats not loaded).
local function ratingIn(short, link)
  local stats = link and C_Item.GetItemStats(link)
  return stats and ns.PlainNumber(stats[W.STATS[short]]) or 0
end

-- The rating in a stat of what an item of equip location loc would replace: both hands for a two-hander, else the
-- worn item.
local function wornRating(short, loc, worn)
  if not UP.TWO_HANDED[loc] then return ratingIn(short, worn) end
  return ratingIn(short, GetInventoryItemLink("player", UP.MAIN_HAND)) + ratingIn(short, GetInventoryItemLink("player", UP.OFF_HAND))
end

-- Takes a stat's amount past its cap off both scores: from what you have less what the worn item gives, only the part
-- of each item's that stays under the cap counts (in units of the cap; the weight is per point of rating). Unchanged
-- with no cap, no weight, or a client that won't say what you have. c: { weights, kind, link, loc, worn }.
local function capOne(c, short, old, new)
  local cap, w, per = UP.Cap(c.kind, short), c.weights[short], UP.PerUnit(short, c.kind)
  local now = cap > 0 and w and per and UP.NOW[short](c.kind)
  if not now then return old, new end
  local worn, item, full = wornRating(short, c.loc, c.worn) / per, ratingIn(short, c.link) / per, w * per
  local room = math.max(0, cap - (now - worn))
  return old - full * math.max(0, worn - room), new - full * math.max(0, item - room)
end

-- The worn and the new scores with every capped stat past its cap taken off both (capOne).
function UP.CapStats(old, new, link, loc, worn)
  local weights, kind = UP.Current()
  local c = { weights = weights, kind = kind, link = link, loc = loc, worn = worn }
  for _, short in ipairs(W.CAP_STATS) do old, new = capOne(c, short, old, new) end
  return old, new
end

-- The worn score, the new one (both nil while either side's stats haven't loaded; stats past their caps taken off), whether
-- the slot is empty, and the worn link.
local function scores(link, loc, slots)
  local old, empty, worn = wornScore(loc, slots)
  if empty then return nil, nil, true end
  local new = score(link)
  if not (old and new) then return nil, nil, false, worn end
  old, new = UP.CapStats(old, new, link, loc, worn)
  return old, new, false, worn
end

-- How an item compares with what you wear: the change in per cent (nil when it isn't gear you
-- can wear, there's nothing to measure, or either side's stats haven't loaded), true when it fills an empty slot,
-- and the worn link.
function UP.Compare(link)
  if not canCompare() then return nil end
  local loc = select(4, C_Item.GetItemInfoInstant(link))
  local slots = UP.SLOTS[loc]
  if not slots or not usable(link) then return nil end
  local old, new, empty, worn = scores(link, loc, slots)
  if empty then return nil, true end
  if not old then return nil, false, worn end
  if old <= 0 then return new > 0 and 100 or nil, false, worn end
  return (new - old) / old * 100, false, worn
end

-- Whether an item gets an arrow: it fills an empty slot or scores at least MIN_PCT higher.
local function isUpgrade(link)
  if type(link) ~= "string" then return false end
  local pct, empty = UP.Compare(link)
  return empty == true or (pct ~= nil and pct >= UP.MIN_PCT)
end

-- Whether an item is an upgrade for you, for other modules (quest automation never picks a reward over one);
-- false while Gear upgrades is switched off.
---@param link string|nil
---@return boolean
function UP.IsUpgrade(link)
  return UP.settings ~= nil and isUpgrade(link)
end

-- Tooltip --------------------------------------------------------------------------------

-- Whether you wear this very item: its own tooltip gets no line against the pair's other one (a bag copy with the
-- same link loses its line too; its arrow, and the auction house's list, still compare it).
local function isWorn(link)
  for slot = 1, UP.LAST_WORN_SLOT do
    if GetInventoryItemLink("player", slot) == link then return true end
  end
  return false
end

-- The item tooltip's line (Tooltips' AddItemLines): "Upgrade +12% (estimate) vs <worn>" in the good color, a drop in the
-- bad one; none on an item you wear. "(estimate)" because the weights behind it are defaults for the class and role, not simulated values.
function UP.AddLine(tt, link)
  if not UP.settings.tooltip then return end
  local pct, empty, worn = UP.Compare(link)
  if empty then return tt:AddLine(L["Upgrade: fills an empty slot"], T.RGB("good")) end
  if not pct or math.abs(pct) < UP.MIN_PCT or isWorn(link) then return end
  local vs = worn and worn:match("%[(.-)%]")
  local change = pct > 0 and L["Upgrade {change} (estimate)"] or L["Downgrade {change} (estimate)"]
  local text = ns.Format(change, { change = string.format("%+.0f%%", pct) })
  if vs then text = ns.Format(L["{line} vs {item}"], { line = text, item = vs }) end
  tt:AddLine(text, T.RGB(pct > 0 and "good" or "bad"))
end

-- Arrows ---------------------------------------------------------------------------------

-- An upward arrow in a button's top-left corner (the theme's Down glyph turned over), made when first needed.
local function arrowOf(button)
  if vgUpgrade[button] then return vgUpgrade[button] end
  local a = button:CreateTexture(nil, "OVERLAY")
  a:SetTexture(T.Icon("Down"))
  a:SetTexCoord(0, 1, 1, 0)
  a:SetSize(14, 14)
  a:SetPoint("TOPLEFT", button, "TOPLEFT", 1, -1)
  vgUpgrade[button] = T.Tint(a, "good")
  return a
end

-- Shows the arrow on a button when on; hides it (if it was ever made) when not.
local function setArrow(button, on)
  if on then arrowOf(button):Show() elseif vgUpgrade[button] then vgUpgrade[button]:Hide() end
end

-- Marks a bag item button: the arrow when the item in it is an upgrade.
local function markButton(button)
  local read = type(C_Container) == "table" and C_Container.GetContainerItemInfo
  if type(button.GetBagID) ~= "function" or type(read) ~= "function" then return end
  local info = read(button:GetBagID(), button:GetID())
  setArrow(button, UP.settings.bags and isUpgrade(info and info.hyperlink))
end

-- Marks every item in a bag window (after the game updates it).
function UP.MarkBag(frame)
  if type(frame.EnumerateValidItems) ~= "function" then return end
  for _, button in frame:EnumerateValidItems() do markButton(button) end
end

-- Marks a quest reward card (QuestDialogParts' card hook): the arrow when its item is an upgrade.
function UP.MarkCard(card, item)
  setArrow(card, UP.settings.quests and isUpgrade(item.link))
end

-- The combined bag updated its slots: mark them (a failure is reported, never breaks the bag).
local function markBagSafely(frame)
  ns.Try("upgrade arrows", UP.MarkBag, frame)
end

-- What you wear changed: mark the combined bag again if it's open.
function UP.OnGearChanged()
  local bag = _G.ContainerFrameCombinedBags
  if bag and bag:IsShown() then UP.MarkBag(bag) end
end

-- Your group role changed, or you left the group: new weights, and the bag marked again.
function UP.OnRolesChanged()
  UP.Changed()
  UP.OnGearChanged()
end

-- /vg weights -----------------------------------------------------------------------------

-- The weights in use as "STR 1, AGI 0.6, ..." (sorted by name).
local function weightsText(weights)
  local parts = {}
  for short, value in pairs(weights) do parts[#parts + 1] = short .. " " .. value end
  table.sort(parts)
  return table.concat(parts, ", ")
end

-- The stat names /vg weights set takes, sorted.
local function statNames()
  local out = {}
  for short in pairs(W.STATS) do out[#out + 1] = short end
  table.sort(out)
  return table.concat(out, ", ")
end

-- A typed weight as a number, or nil for text that isn't one. Lua reads "nan", "inf" and "1e400" as numbers
-- that would turn every score into nan or inf, so only finite numbers count.
---@param text any
---@return number|nil
function UP.ParseWeight(text)
  local n = tonumber(text)
  local finite = n and n == n and n > -math.huge and n < math.huge
  if finite then return n end
end

-- A saved or pasted value as a weight: a finite number, else nil (text, even "3", is not one).
---@param value any
---@return number|nil
function UP.Weight(value)
  return type(value) == "number" and UP.ParseWeight(value) or nil
end

-- Sets one weight for the kind in use ("set STR 1.2"); 0 makes a stat worthless.
local function setWeight(stat, value)
  local short, n = (stat or ""):upper(), UP.ParseWeight(value)
  if not W.STATS[short] or not n then return ns.Chat(ns.Format(L["Use /vg weights set <stat> <number>; stats: {stats}."], { stats = statNames() })) end
  local own = UP.Own(UP.kind) or {}
  own[short] = n
  UP.SetOwn(UP.kind, own)
  ns.Chat(ns.Format(L["{stat} is worth {weight} for {kind} now."], { stat = short, weight = n, kind = UP.Word(UP.kind) }))
  UP.Changed()
end

-- Puts the kind in use back to its default weights.
local function resetWeights()
  local kind = UP.kind
  UP.SetOwn(kind, nil)
  UP.ResetCaps(kind)
  UP.Changed()
  ns.Chat(ns.Format(L["Weights for {kind} are back to the defaults."], { kind = UP.Word(kind) }))
end

-- A Vanguard weights string (/vg weights export) applied, for your class, to the kind it was made for, with its caps
-- when it has them; false and why when it can't be.
local function importVanguard(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return false, data end
  if scope ~= "weights" or not W.KINDS[data.kind] or type(data.weights) ~= "table" then return false, L["not a weights string"] end
  local clean = {}
  for short, n in pairs(data.weights) do clean[short] = W.STATS[short] and UP.Weight(n) or nil end
  UP.SetOwn(data.kind, clean)
  UP.ResetCaps(data.kind)
  for short, n in pairs(type(data.caps) == "table" and data.caps or {}) do if UP.Weight(n) then UP.SetCap(data.kind, short, n) end end
  return true, data.kind
end

-- A guide string's weights as the whole set for the kind in use: the stats it leaves out are worth nothing, as they
-- are in the tool it was written for (item level, which those strings never weigh, keeps its weight). A weight the
-- string gives per 1% becomes one per point of rating, as items carry it (W.RATING_PER_UNIT).
local function guideSet(weights)
  local out = {}
  for short in pairs(W.STATS) do if short ~= "ILVL" then out[short] = (weights[short] or 0) / (W.RATING_PER_UNIT[short] or 1) end end
  out.ILVL = W.STATS.ILVL and (UP.Current()).ILVL or nil
  return out
end

-- A guide site's weight string (ns.UpgradeStrings) applied to the weights in use for your class; false and why when
-- it is for another class or has no stat Vanguard knows.
local function importGuide(guide)
  local kind = select(2, UP.Current())
  if guide.class and guide.class ~= UP.Class() then return false, ns.Format(L["the string is for another class ({class})"], { class = guide.class }) end
  if not next(guide.weights) then return false, L["no stat in it that Vanguard weighs"] end
  UP.SetOwn(kind, guideSet(guide.weights))
  return true, kind, guide.skipped
end

-- Applies a pasted string: a Vanguard weights string, or a guide site's. True, the kind and (for a guide string) the
-- names it skipped; false and why when it can't.
function UP.Import(text)
  local guide = ns.UpgradeStrings.Parse(text)
  local done, kind, skipped = (guide and importGuide or importVanguard)(guide or text)
  if done then UP.Changed() end
  return done, kind, skipped
end

-- Says in chat what an import did: the kind, and the stats a guide string had that Vanguard doesn't weigh.
local function sayImported(kind, skipped)
  ns.Chat(ns.Format(L["Imported weights for {kind}."], { kind = UP.Word(kind) }))
  if skipped and #skipped > 0 then ns.Chat(ns.Format(L["Skipped what Vanguard doesn't weigh: {stats}."], { stats = table.concat(skipped, ", ") })) end
end

-- The import box (Import stat weights under Gear upgrades, /vg weights import): paste a string from /vg weights
-- export or a guide site.
function UP.ImportDialog()
  if not UP.settings then return UP.Wizard.SayNotStarted() end
  ns.AskText(L["Paste a Vanguard or guide site weights string, then Import"], function(text)
    local done, detail, skipped = UP.Import(text)
    if not done then return ns.Chat(ns.Format(L["Import failed: {why}."], { why = detail })) end
    ns.HideText()
    sayImported(detail, skipped)
  end)
end

-- The caps in use for the kind in use, short name -> cap (only the ones set).
local function capsInUse()
  local out = {}
  for _, short in ipairs(W.CAP_STATS) do
    local cap = UP.Cap(UP.kind, short)
    if cap > 0 then out[short] = cap end
  end
  return out
end

-- The caps to share for the kind in use, 0 (none) included, so an import doesn't bring back the kind's own cap.
local function capsToShare()
  local out = {}
  for _, short in ipairs(W.CAP_STATS) do out[short] = UP.Cap(UP.kind, short) end
  return out
end

-- /vg weights export: the weights in use, for the kind they're for, with the caps, as a string to copy.
local function exportWeights()
  local title = ns.Format(L["Vanguard weights ({kind})  Ctrl+C to copy"], { kind = UP.Word(UP.kind) })
  ns.ShowText(title, ns.Serialize.Encode("weights", { kind = UP.kind, weights = UP.current, caps = capsToShare() }))
end

-- /vg weights: the weights in use, who they're for, and the caps when any is set.
local function sayWeights()
  ns.Chat(ns.Format(L["Weights for {kind} (role {role}): {weights}"], { kind = UP.Word(UP.kind), role = UP.Word(UP.Role()), weights = weightsText(UP.current) }))
  local caps = capsInUse()
  if next(caps) then ns.Chat(ns.Format(L["Caps (past them a stat counts for nothing): {caps}"], { caps = weightsText(caps) })) end
end

-- /vg weights [wizard|set <stat> <n>|reset|export|import].
function UP.Command(rest)
  local word, a, b = (rest or ""):match("^%s*(%S*)%s*(%S*)%s*(%S*)")
  word = word:lower()
  if word == "wizard" or not UP.settings then return UP.Wizard.Open() end
  UP.Current()
  if word == "set" then return setWeight(a, b) end
  if word == "reset" then return resetWeights() end
  if word == "export" then return exportWeights() end
  if word == "import" then return UP.ImportDialog() end
  sayWeights()
end

-- The combined bag's slot update, marked through a gate once a session (a hook can't be taken off; the gate does
-- nothing while the module is off). Only when the bag exists: a start before it does is tried again at the next.
local function hookBag(scope)
  local bag = _G.ContainerFrameCombinedBags
  if not (bag and type(hooksecurefunc) == "function") then return end
  scope:Gate("bag slots", markBagSafely, function(gate) hooksecurefunc(bag, "UpdateItems", ns.Guard("hook UpdateItems", gate)) end)
end

-- Module entry point (Core/Modules.lua): everything goes through the scope; the tooltip line, the reward card
-- painter and the bag hook are gates (they stay installed, inert while the module is off).
function UP.Enable(settings, scope)
  UP.settings = settings
  UP.Changed()
  scope:Gate("item lines", UP.AddLine, ns.GetModule("Tooltips").AddItemLines)
  scope:Gate("reward cards", UP.MarkCard, ns.QuestParts.OnPaintCard)
  hookBag(scope)
  scope:On("PLAYER_EQUIPMENT_CHANGED", UP.OnGearChanged)
  scope:On("PLAYER_ROLES_ASSIGNED", UP.OnRolesChanged)
  if not ns.IsForever() then scope:On("ACTIVE_PLAYER_SPECIALIZATION_CHANGED", UP.OnRolesChanged) end -- a new spec, new main stat
  scope:On("GROUP_LEFT", UP.OnRolesChanged) -- out of a group the role is none again, which no role event may say
  if ns.ModulesBuilt() then UP.OnGearChanged() end
end

-- Switched off: the arrows already drawn on bag slots and reward cards go, and the module reads as off again
-- (no settings: IsUpgrade is false, the wizard and the import say it is not started), as after a login with it off.
function UP.Disable()
  for _, arrow in pairs(vgUpgrade) do arrow:Hide() end
  UP.settings = nil
end
