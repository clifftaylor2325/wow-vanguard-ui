-- Gear upgrades: how an item compares with what you wear, by stat weights for
-- your class and role (Modules/UpgradeWeights.lua). An item's tooltip says
-- "Upgrade +12% (estimate) vs <worn item>" (or a drop), an arrow marks upgrades in the
-- combined bag, and on quest reward cards. Rings, trinkets compare with the
-- weaker of the two you wear; a two-hander with both hands; an empty slot is
-- always an upgrade. Gear you can't wear is left alone.
--
-- /vg weights shows the weights in use; set <stat> <n>, reset, export and
-- import change or share them (a profile keeps its own).
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

local UP = ns.Module("Upgrades", { defaults = { tooltip = true, bags = true, quests = true, role = "auto", weights = {} } })

-- A change smaller than this (per cent) isn't shown.
UP.MIN_PCT = 0.5
-- The inventory slots of the main hand and the off hand (a two-hander fills both).
UP.MAIN_HAND, UP.OFF_HAND = 16, 17
-- Equip locations -> the inventory slots they go in (a pair compares with the weaker).
UP.SLOTS = {
  INVTYPE_HEAD = { 1 }, INVTYPE_NECK = { 2 }, INVTYPE_SHOULDER = { 3 }, INVTYPE_CHEST = { 5 }, INVTYPE_ROBE = { 5 },
  INVTYPE_WAIST = { 6 }, INVTYPE_LEGS = { 7 }, INVTYPE_FEET = { 8 }, INVTYPE_WRIST = { 9 }, INVTYPE_HAND = { 10 },
  INVTYPE_FINGER = { 11, 12 }, INVTYPE_TRINKET = { 13, 14 }, INVTYPE_CLOAK = { 15 },
  INVTYPE_WEAPON = { 16 }, INVTYPE_WEAPONMAINHAND = { 16 }, INVTYPE_2HWEAPON = { 16 },
  INVTYPE_WEAPONOFFHAND = { 17 }, INVTYPE_SHIELD = { 17 }, INVTYPE_HOLDABLE = { 17 },
  INVTYPE_RANGED = { 18 }, INVTYPE_RANGEDRIGHT = { 18 }, INVTYPE_THROWN = { 18 }, INVTYPE_RELIC = { 18 },
}

-- Weights ---------------------------------------------------------------------------------

-- The role weights are picked for: the setting, else (auto) your group role, damage when you have none.
function UP.Role()
  if UP.settings.role ~= "auto" then return UP.settings.role end
  return ns.PlayerRole()
end

-- What the lines call each kind of character and each role (the keys of ns.UpgradeWeights.KINDS and of a class's roles).
UP.WORDS = {
  strength = L["strength"], agility = L["agility"], caster = L["caster"],
  damage = L["damage"], tank = L["tank"], healer = L["healer"],
}

-- A kind or a role as the lines name it (the key itself for one not listed).
---@param key string
---@return string
function UP.Word(key)
  return UP.WORDS[key] or key
end

-- The weights in use (the defaults with this profile's changes) and the kind of character they're for.
function UP.Weights()
  local _, class = UnitClass("player")
  local kind = W.Kind(class, UP.Role())
  local out = ns.Copy(W.KINDS[kind])
  for short, value in pairs(UP.settings.weights[kind] or {}) do out[short] = value end
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

-- What an item is worth with weights: weight x amount, summed over its stats (0 for none).
function UP.Score(link, weights)
  local score = 0
  for key, amount in pairs(C_Item.GetItemStats(link) or {}) do
    local w, n = weights[W.SHORT[key]], ns.PlainNumber(amount)
    if w and n then score = score + w * n end
  end
  return score
end

-- An item's score with the weights in use, remembered until they change.
local function score(link)
  if not UP.scores[link] then UP.scores[link] = UP.Score(link, (UP.Current())) end
  return UP.scores[link]
end

-- The score of what's worn in an inventory slot (0 when empty), and whether it's empty.
local function equipped(slot)
  local link = GetInventoryItemLink("player", slot)
  if not link then return 0, true end
  return score(link), false
end

-- The weakest worn item among slots: its score, whether a slot is empty, and its link.
local function weakest(slots)
  local low, at
  for _, slot in ipairs(slots) do
    local s, empty = equipped(slot)
    if empty then return 0, true, nil end
    if not low or s < low then low, at = s, slot end
  end
  return low, false, GetInventoryItemLink("player", at)
end

-- What both hands are worth together, for a two-hander: main hand plus off hand.
local function bothHands()
  local mh, empty = equipped(UP.MAIN_HAND)
  return mh + (equipped(UP.OFF_HAND)), empty, GetInventoryItemLink("player", UP.MAIN_HAND)
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
  if loc == "INVTYPE_2HWEAPON" then return bothHands() end
  return weakest(slots)
end

-- How an item compares with what you wear: the change in per cent (nil when it isn't gear you
-- can wear, or there's nothing to measure), true when it fills an empty slot, and the worn link.
function UP.Compare(link)
  if not canCompare() then return nil end
  local loc = select(4, C_Item.GetItemInfoInstant(link))
  local slots = UP.SLOTS[loc]
  if not slots or not usable(link) then return nil end
  local old, empty, worn = wornScore(loc, slots)
  if empty then return nil, true end
  local new = score(link)
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

-- The item tooltip's line (Tooltips' AddItemLines): "Upgrade +12% (estimate) vs <worn>" in the good color, a drop in the
-- bad one. "(estimate)" because the weights behind it are defaults for the class and role, not simulated values.
function UP.AddLine(tt, link)
  if not UP.settings.tooltip then return end
  local pct, empty, worn = UP.Compare(link)
  if empty then return tt:AddLine(L["Upgrade: fills an empty slot"], T.RGB("good")) end
  if not pct or math.abs(pct) < UP.MIN_PCT then return end
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

-- Your group role changed: new weights, and the bag marked again.
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

-- Sets one weight for the kind in use ("set STR 1.2"); 0 makes a stat worthless.
local function setWeight(stat, value)
  local short, n = (stat or ""):upper(), UP.ParseWeight(value)
  if not W.STATS[short] or not n then return ns.Chat(ns.Format(L["Use /vg weights set <stat> <number>; stats: {stats}."], { stats = statNames() })) end
  UP.settings.weights[UP.kind] = UP.settings.weights[UP.kind] or {}
  UP.settings.weights[UP.kind][short] = n
  ns.Chat(ns.Format(L["{stat} is worth {weight} for {kind} now."], { stat = short, weight = n, kind = UP.Word(UP.kind) }))
  UP.Changed()
end

-- Puts the kind in use back to its default weights.
local function resetWeights()
  local kind = UP.kind
  UP.settings.weights[kind] = nil
  UP.Changed()
  ns.Chat(ns.Format(L["Weights for {kind} are back to the defaults."], { kind = UP.Word(kind) }))
end

-- Applies a pasted weights string to the kind it was made for; false and why when it can't.
function UP.Import(text)
  local scope, data = ns.Serialize.Decode(text)
  if not scope then return false, data end
  if scope ~= "weights" or not W.KINDS[data.kind] or type(data.weights) ~= "table" then return false, L["not a weights string"] end
  local clean = {}
  for short, n in pairs(data.weights) do if W.STATS[short] and type(n) == "number" then clean[short] = n end end
  UP.settings.weights[data.kind] = clean
  UP.Changed()
  return true, data.kind
end

-- The import box: paste a string from /vg weights export.
local function importDialog()
  ns.AskText(L["Paste a Vanguard weights string, then Import"], function(text)
    local done, detail = UP.Import(text)
    if not done then return ns.Chat(ns.Format(L["Import failed: {why}."], { why = detail })) end
    ns.HideText()
    ns.Chat(ns.Format(L["Imported weights for {kind}."], { kind = UP.Word(detail) }))
  end)
end

-- /vg weights [wizard|set <stat> <n>|reset|export|import].
function UP.Command(rest)
  local word, a, b = (rest or ""):match("^%s*(%S*)%s*(%S*)%s*(%S*)")
  word = word:lower()
  if word == "wizard" or not UP.settings then return UP.Wizard.Open() end
  UP.Current()
  if word == "set" then return setWeight(a, b) end
  if word == "reset" then return resetWeights() end
  if word == "export" then return ns.ShowText(ns.Format(L["Vanguard weights ({kind})  Ctrl+C to copy"], { kind = UP.Word(UP.kind) }), ns.Serialize.Encode("weights", { kind = UP.kind, weights = UP.current })) end
  if word == "import" then return importDialog() end
  ns.Chat(ns.Format(L["Weights for {kind} (role {role}): {weights}"], { kind = UP.Word(UP.kind), role = UP.Word(UP.Role()), weights = weightsText(UP.current) }))
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
end
