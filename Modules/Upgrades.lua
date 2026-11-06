-- Gear upgrades: how an item compares with what you wear, by stat weights for
-- your class and role (Modules/UpgradeWeights.lua). An item's tooltip says
-- "Upgrade +12% (estimate) vs <worn item>" (or a drop), an arrow marks upgrades in the
-- combined bag, and on quest reward cards. Rings, trinkets compare with the
-- weaker of the two you wear; a two-hander with both hands; an empty slot is
-- always an upgrade. Gear you can't wear is left alone.
--
-- /vg weights shows the weights in use; set <stat> <n>, reset, export and
-- import change or share them (a profile keeps its own, per class). On WoW
-- Forever a druid or shaman picks a damage style, and a hit cap set in the
-- wizard makes hit past it worth nothing.
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


-- weights: class -> kind -> this profile's changes to the defaults; caps: class -> kind -> hit cap (per cent);
-- styles: class -> its damage style on WoW Forever (ns.UpgradeWeights.STYLES).
local UP = ns.Module("Upgrades", { defaults = { tooltip = true, bags = true, quests = true, role = "auto", weights = {}, caps = {}, styles = {} } })

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

-- The hit cap set for a kind for your class, per cent (0: none).
function UP.Cap(kind)
  return (UP.settings.caps[UP.Class()] or {})[kind] or 0
end

-- Sets the hit cap for a kind for your class (0 or less: none).
function UP.SetCap(kind, cap)
  local all, class = UP.settings.caps, UP.Class()
  all[class] = all[class] or {}
  all[class][kind] = cap > 0 and cap or nil
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
  for short, value in pairs(UP.Own(kind) or {}) do out[short] = value end
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

-- What an item of equip location loc is compared with: both hands for a two-hander, else the weakest of its slots.
local function wornScore(loc, slots)
  if UP.TWO_HANDED[loc] then return bothHands() end
  return weakest(slots)
end

-- Hit cap ---------------------------------------------------------------------------------

-- An item's hit (its HIT stat; 0 for none, no link, or stats not loaded).
local function hitOf(link)
  local key = W.STATS.HIT
  local stats = key and link and C_Item.GetItemStats(link)
  return stats and ns.PlainNumber(stats[key]) or 0
end

-- The combat ratings a kind's hit is counted from (the client's CR_HIT_SPELL and CR_HIT_MELEE).
UP.HIT_RATING = { spell = 8, melee = 6 }

-- Your chance to hit now, per cent, summed as WoW Forever's character sheet sums it (PaperDollFrameStats.lua): the
-- hit rating's bonus plus the hit modifier, spell hit for a kind that casts, melee hit for the rest. nil when the
-- client can't say or hides it (the 12.1 client can make both secret).
local function hitNow(kind)
  local spell = W.SPELL_KINDS[kind]
  local read = spell and GetSpellHitModifier or GetHitModifier
  local hit = type(read) == "function" and ns.PlainNumber(read())
  local bonus = type(GetCombatRatingBonus) == "function" and ns.PlainNumber(GetCombatRatingBonus(UP.HIT_RATING[spell and "spell" or "melee"]))
  return hit and hit + (bonus or 0) or nil
end

-- The hit of what an item of equip location loc would replace: both hands for a two-hander, else the worn item.
local function wornHit(loc, worn)
  if not UP.TWO_HANDED[loc] then return hitOf(worn) end
  return hitOf(GetInventoryItemLink("player", UP.MAIN_HAND)) + hitOf(GetInventoryItemLink("player", UP.OFF_HAND))
end

-- The worn and the new scores with hit past the cap taken off both: from your hit less what the worn item gives,
-- only the part of each item's hit that stays under the cap counts. Unchanged with no cap, no hit weight, or a client
-- that won't say your hit.
function UP.CapHit(old, new, link, loc, worn)
  local weights, kind = UP.Current()
  local cap, w = UP.Cap(kind), weights.HIT
  local now = cap > 0 and w and hitNow(kind)
  if not now then return old, new end
  local oldHit = wornHit(loc, worn)
  local room = math.max(0, cap - (now - oldHit))
  return old - w * math.max(0, oldHit - room), new - w * math.max(0, hitOf(link) - room)
end

-- The worn score, the new one (both nil while either side's stats haven't loaded; hit past the cap taken off), whether
-- the slot is empty, and the worn link.
local function scores(link, loc, slots)
  local old, empty, worn = wornScore(loc, slots)
  if empty then return nil, nil, true end
  local new = score(link)
  if not (old and new) then return nil, nil, false, worn end
  old, new = UP.CapHit(old, new, link, loc, worn)
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
  UP.SetCap(kind, 0)
  UP.Changed()
  ns.Chat(ns.Format(L["Weights for {kind} are back to the defaults."], { kind = UP.Word(kind) }))
end

-- A Vanguard weights string (/vg weights export) applied, for your class, to the kind it was made for, with its hit
-- cap when it has one; false and why when it can't be.
local function importVanguard(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return false, data end
  if scope ~= "weights" or not W.KINDS[data.kind] or type(data.weights) ~= "table" then return false, L["not a weights string"] end
  local clean = {}
  for short, n in pairs(data.weights) do clean[short] = W.STATS[short] and UP.Weight(n) or nil end
  UP.SetOwn(data.kind, clean)
  UP.SetCap(data.kind, UP.Weight(data.cap) or 0)
  return true, data.kind
end

-- A guide string's weights as the whole set for the kind in use: the stats it leaves out are worth nothing, as they
-- are in the tool it was written for (item level, which those strings never weigh, keeps its weight).
local function guideSet(weights)
  local out = {}
  for short in pairs(W.STATS) do if short ~= "ILVL" then out[short] = weights[short] or 0 end end
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

-- /vg weights export: the weights in use, for the kind they're for, with the hit cap, as a string to copy.
local function exportWeights()
  local title = ns.Format(L["Vanguard weights ({kind})  Ctrl+C to copy"], { kind = UP.Word(UP.kind) })
  ns.ShowText(title, ns.Serialize.Encode("weights", { kind = UP.kind, weights = UP.current, cap = UP.Cap(UP.kind) }))
end

-- /vg weights: the weights in use, who they're for, and the hit cap when one is set.
local function sayWeights()
  ns.Chat(ns.Format(L["Weights for {kind} (role {role}): {weights}"], { kind = UP.Word(UP.kind), role = UP.Word(UP.Role()), weights = weightsText(UP.current) }))
  local cap = UP.Cap(UP.kind)
  if cap > 0 then ns.Chat(ns.Format(L["Hit past {cap}% counts for nothing."], { cap = cap })) end
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

-- Module entry point (Core/Modules.lua).
function UP.Enable(settings)
  UP.settings = settings
  UP.Changed()
  ns.GetModule("Tooltips").AddItemLines(UP.AddLine)
  ns.QuestParts.OnPaintCard(UP.MarkCard)
  local bag = _G.ContainerFrameCombinedBags
  if bag and type(hooksecurefunc) == "function" then hooksecurefunc(bag, "UpdateItems", ns.Guard("hook UpdateItems", markBagSafely)) end
  ns.On("PLAYER_EQUIPMENT_CHANGED", UP.OnGearChanged)
  ns.On("PLAYER_ROLES_ASSIGNED", UP.OnRolesChanged)
  if not ns.IsForever() then ns.On("ACTIVE_PLAYER_SPECIALIZATION_CHANGED", UP.OnRolesChanged) end -- a new spec, new main stat
  ns.On("GROUP_LEFT", UP.OnRolesChanged) -- out of a group the role is none again, which no role event may say
end
