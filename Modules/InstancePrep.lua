-- Instance prep: a checklist card of what you're short of, at the door of a
-- dungeon or raid (only when something is low), on a ready check, or with
-- /vg prep: ammo (hunters), soul shards (warlocks), your class's reagents,
-- food and drink, bandages, potions, worn gear, and the Keep-stocked items
-- (/vg stock) you carry fewer of than the list says. The card fades after
-- Hide after seconds (ns.AutoHide), or at once from its close button. Its
-- Buy list button turns what's short that you can buy (PR.BuyRows) into the
-- Auction helper's Restock shopping list (Modules/AuctionRestock.lua).
-- Every count the client hides skips its row, never compared; nothing is
-- checked in combat, and /vg prep in combat waits for the fight to end.
-- Anywhere, a supply that runs low is said once in chat (Warn in chat; it
-- speaks again only after the supply has been back at its wanted count).

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local PR = ns.Module("InstancePrep", {
  defaults = {
    onEnter = true, onReadyCheck = true, lowWarn = true, hideAfter = 20, durability = 50,
    want = { food = 20, bandages = 10, potions = 3, ammo = 400, shards = 10 },
  },
})

-- The card's width, row height, padding and where its rows start (under the title).
PR.WIDTH, PR.ROW, PR.PAD, PR.TOP = 260, 18, 8, 40
-- The instance types the door check covers (ns.Where): dungeons and raids.
PR.DOORS = { party = true, raid = true }
-- Consumables are item class 0 (Enum.ItemClass.Consumable); by subclass
-- (Enum.ItemConsumableSubclass, ItemConstantsDocumentation.lua): Potion 1,
-- Fooddrink 5 (food and water share it), Bandage 7.
PR.CONSUMABLE, PR.SUBCLASS = 0, { [1] = "potions", [5] = "food", [7] = "bandages" }
-- The consumable rows in the card's order: their want key and label.
PR.CONSUMABLES = { { "food", "Food & drink" }, { "bandages", "Bandages" }, { "potions", "Potions" } }
-- The bags one scan reads: the backpack, four bags and the reagent bag.
PR.LAST_BAG = 5
-- What /vg prep want can set.
PR.WANTS = { food = true, bandages = true, potions = true, ammo = true, shards = true }

-- Class reagents: { itemID, want, name, minLevel, maxLevel }. A row shows
-- from minLevel (the level that learns the spell using it) up to maxLevel,
-- when there is one (a higher rank's reagent takes over). Warlocks get the
-- soul shard row and hunters the ammo row instead.
-- UNVERIFIED: these item IDs are from the classic database; they are not in
-- the Forever UI source. Check each class with /vg prep in game.
PR.REAGENTS = {
  MAGE = { { 17031, 10, "Rune of Teleportation", 20 }, { 17032, 5, "Rune of Portals", 40 }, { 17020, 20, "Arcane Powder", 56 } },
  PRIEST = { { 17028, 20, "Holy Candle", 48, 59 }, { 17029, 20, "Sacred Candle", 56 } },
  DRUID = {
    { 17034, 3, "Maple Seed", 20, 29 }, { 17035, 3, "Stranglethorn Seed", 30, 39 }, { 17036, 3, "Ashwood Seed", 40, 49 },
    { 17037, 3, "Hornbeam Seed", 50, 59 }, { 17038, 3, "Ironwood Seed", 60 },
    { 17021, 20, "Wild Berries", 50, 59 }, { 17026, 20, "Wild Thornroot", 60 },
  },
  PALADIN = { { 17033, 5, "Symbol of Divinity", 30 }, { 21177, 50, "Symbol of Kings", 52 } },
  SHAMAN = { { 17030, 5, "Ankh", 30 }, { 17057, 5, "Shiny Fish Scales", 22 }, { 17058, 5, "Fish Oil", 28 } },
  ROGUE = { { 5140, 10, "Flash Powder", 22 }, { 5530, 10, "Blinding Powder", 34 } },
}

-- Counting ------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- How many of an item you carry, or nil when the client can't (or won't) say.
local function count(id)
  local get = C_Item and C_Item.GetItemCount
  if type(get) ~= "function" then return nil end
  return ns.PlainNumber(get(id))
end

-- The consumable row an item counts toward ("food", "bandages", "potions"), or nil.
-- GetItemInfoInstant answers from the client's own data, so a bag item is
-- classed even before its full info is cached.
local function classify(itemID)
  local info = C_Item and C_Item.GetItemInfoInstant
  if ns.IsSecret(itemID) or type(info) ~= "function" then return nil end
  local _, _, _, _, _, class, sub = info(itemID)
  if ns.PlainNumber(class) ~= PR.CONSUMABLE then return nil end
  return PR.SUBCLASS[ns.PlainNumber(sub)]
end

-- Adds one bag slot's item to the counts; a hidden stack makes its row's count unknown (false).
local function tally(counts, item)
  local key = type(item) == "table" and classify(item.itemID)
  if not key then return end
  local n = ns.PlainNumber(item.stackCount)
  counts[key] = n and counts[key] and counts[key] + n or false
end

-- Food and drink, bandages and potions in your bags from one scan: key ->
-- count (false when a stack was hidden), or nil when the client can't say.
function PR.Consumables()
  local info, slots = C_Container and C_Container.GetContainerItemInfo, C_Container and C_Container.GetContainerNumSlots
  if type(info) ~= "function" or type(slots) ~= "function" then return nil end
  local counts = { food = 0, bandages = 0, potions = 0 }
  for bag = 0, PR.LAST_BAG do
    for slot = 1, ns.PlainNumber(slots(bag)) or 0 do tally(counts, info(bag, slot)) end
  end
  return counts
end

-- Rows ----------------------------------------------------------------------------------------

-- A row for something short ({ label, value = "have / want", and for an item
-- you can buy its id and how many more you need }), or nil when you have
-- enough or the count is hidden (a hidden count is never compared).
local function short(label, have, want, id)
  have = ns.PlainNumber(have)
  if have and want and have < want then return { label = label, value = have .. " / " .. want, id = id, need = want - have } end
end

-- Your class (MAGE, PRIEST...) and level, or nil and 0 for what the client hides.
local function you()
  local _, class = UnitClass("player")
  return not ns.IsSecret(class) and class or nil, ns.PlainNumber(UnitLevel("player")) or 0
end

-- The class rows: ammo for hunters, soul shards for warlocks, then the class's reagents at your level.
function PR.ReagentRows()
  local rows, class, level = {}, you()
  local IS, want = ns.GetModule("InfoStrip"), PR.settings.want
  if class == "HUNTER" then rows[#rows + 1] = short("Ammo", ask("GetInventoryItemCount", "player", IS.AMMO_SLOT), want.ammo) end
  if class == "WARLOCK" then rows[#rows + 1] = short("Soul shards", IS.SoulShards(), want.shards) end
  for _, r in ipairs(PR.REAGENTS[class] or {}) do
    if level >= r[4] and level <= (r[5] or level) then rows[#rows + 1] = short(r[3], count(r[1]), r[2], r[1]) end
  end
  return rows
end

-- An item's name when the client has it cached, else "item 123".
local function itemName(id)
  local info = C_Item and C_Item.GetItemInfo
  local name = type(info) == "function" and info(id)
  if type(name) == "string" then return name end
  return "item " .. id
end

-- The Keep-stocked items (Errands, /vg stock) you carry fewer of than the list says, by item ID.
function PR.StockRows()
  local ER, rows, ids = ns.GetModule("Errands"), {}, {}
  local list = ER.settings and ER.settings.stockList or {}
  for id in pairs(list) do ids[#ids + 1] = id end
  table.sort(ids)
  for _, id in ipairs(ids) do rows[#rows + 1] = short(itemName(id), count(id), list[id], id) end
  return rows
end

-- The durability row, when your most worn item is under the warning.
local function durabilityRow()
  local p = ns.GetModule("InfoStrip").Durability()
  if p and p < PR.settings.durability then return { label = "Durability", value = p .. "%" } end
end

-- Everything short, in the card's order: class rows, food, bandages, potions, durability, stock.
function PR.Rows()
  local rows, counts, want = PR.ReagentRows(), PR.Consumables() or {}, PR.settings.want
  for _, c in ipairs(PR.CONSUMABLES) do rows[#rows + 1] = short(c[2], counts[c[1]], want[c[1]]) end
  rows[#rows + 1] = durabilityRow()
  for _, r in ipairs(PR.StockRows()) do rows[#rows + 1] = r end
  return rows
end

-- What's short that you can buy, as { id, need } in the card's order: your class's reagents
-- (while Instance prep is on) and the Keep-stocked items under their count; an item on both
-- needs the larger amount. Ammo, soul shards, food, bandages and potions are kinds of item, not
-- one item, so they're left out. The Auction helper's Restock list is made from these.
function PR.BuyRows()
  local rows, out, seen = PR.settings and PR.ReagentRows() or {}, {}, {}
  for _, r in ipairs(PR.StockRows()) do rows[#rows + 1] = r end
  for _, r in ipairs(rows) do
    local had = r.id and seen[r.id]
    if had then had.need = math.max(had.need, r.need) end
    if r.id and not had then seen[r.id] = { id = r.id, need = r.need } out[#out + 1] = seen[r.id] end
  end
  return out
end

-- The card --------------------------------------------------------------------------------------

-- A row's red mark: a small square at its left.
local function mark(r)
  local m = W.Flat(r, "ARTWORK", "bad")
  m:SetSize(6, 6)
  m:SetPoint("LEFT", 0, 0)
  return m
end

-- Row i of the card: a red mark, the label, and "have / want" at the right in red.
local function rowFrame(i)
  local r = CreateFrame("Frame", nil, PR.card)
  r:SetSize(PR.WIDTH - 2 * PR.PAD, PR.ROW)
  r:SetPoint("TOPLEFT", PR.PAD, -PR.TOP - (i - 1) * PR.ROW)
  r.mark = mark(r)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label")
  r.label:SetPoint("LEFT", r.mark, "RIGHT", 6, 0)
  r.value = T.Text(r:CreateFontString(nil, "OVERLAY"), "number", "bad")
  r.value:SetPoint("RIGHT", 0, 0)
  return r
end

-- Shows one row on a row frame, or hides the frame when there is none.
local function paintRow(r, row)
  r:SetShown(row ~= nil)
  if not row then return end
  r.label:SetText(row.label)
  r.value:SetText(row.value)
end

-- Whether the card offers Buy list: a row is an item you can buy, and the Auction helper is on.
local function canBuy(rows)
  for _, r in ipairs(rows) do
    if r.id then return ns.GetModule("AuctionHelper").settings ~= nil end
  end
  return false
end

-- Puts rows on the card ("Everything's packed." when there are none), with Buy list when one
-- can be bought, and sizes it to fit.
function PR.Paint(rows)
  local card = PR.card
  card.buy:SetShown(canBuy(rows))
  for i = #card.rows + 1, #rows do card.rows[i] = rowFrame(i) end
  for i, r in ipairs(card.rows) do paintRow(r, rows[i]) end
  card.packed:SetShown(#rows == 0)
  card:SetHeight(PR.TOP + math.max(#rows, 1) * PR.ROW + PR.PAD)
end

-- The card's title, in line with its close button (fades it out), and the packed line.
local function cardParts(f)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.title:SetPoint("LEFT", f, "TOPLEFT", PR.PAD, -T.CONTROL.inset)
  f.title:SetText("Instance prep")
  f.close = T.PlaceClose(T.CloseButton(CreateFrame("Button", nil, f)), f)
  f.close:SetScript("OnClick", ns.Guard("click close instance prep", function() T.FadeOut(f) end))
  f.packed = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "good")
  f.packed:SetPoint("TOPLEFT", PR.PAD, -PR.TOP - 2)
  f.packed:SetText("Everything's packed.")
end

-- The card's Buy list button, left of the close button: what's short that you can buy becomes the
-- Auction helper's Restock shopping list (Modules/AuctionRestock.lua). Hidden until PR.Paint shows it.
local function buyButton(f)
  f.buy = W.Button(f, "Buy list", function() ns.GetModule("AuctionHelper").Restock() end, 64)
  f.buy:SetHeight(20)
  f.buy:SetPoint("RIGHT", f.close, "LEFT", -4, 0)
  f.buy:Hide()
end

-- The card: a floating panel you can move (/vg unlock), hidden until called up.
local function buildCard()
  local f = CreateFrame("Frame", "Vanguard_PrepCard", UIParent)
  T.Panel(f, { shadow = true })
  f:SetSize(PR.WIDTH, PR.TOP + PR.ROW + PR.PAD)
  f.rows = {}
  cardParts(f)
  buyButton(f)
  f:Hide()
  PR.card = f
  ns.Mover(f, "prepcard", "Instance prep", { "CENTER", "CENTER", 0, 180 })
end

-- Showing ---------------------------------------------------------------------------------------

-- Shows the card with what's short, fading it out after Hide after seconds.
-- Nothing short: forced (a ready check, /vg prep) it says "Everything's
-- packed."; otherwise (at the door) it stays away.
function PR.Show(force)
  local rows = PR.Rows()
  if #rows == 0 and not force then return end
  PR.Paint(rows)
  T.FadeIn(PR.card)
  ns.AutoHide(PR.card, PR.settings.hideAfter)
end

-- You came into a world: at a dungeon or raid's door, once per visit (a reload
-- inside doesn't count again), the card shows if something is low. Not in combat.
function PR.OnEnter()
  local where = ns.Where()
  if not PR.DOORS[where] then PR.lastInstance = nil return end
  local id = ns.PlainNumber((select(8, ask("GetInstanceInfo"))))
  if not PR.settings.onEnter or ns.InCombat() or (id and id == PR.lastInstance) then return end
  PR.lastInstance = id
  PR.Show(false)
end

-- A ready check started: the card, packed or not (not in combat). The
-- initiator's name, secret in chat lockdown, is never read.
function PR.OnReadyCheck()
  if PR.settings.onReadyCheck and not ns.InCombat() then PR.Show(true) end
end

-- Low-supply warning ------------------------------------------------------------------------

-- The supplies that are short now: by item (or label), each { text = "Food & drink 3 / 20" }, and their order.
-- An item's name can change as the client caches it, so items are told apart by id.
function PR.LowSupplies()
  local low, order = {}, {}
  for _, r in ipairs(PR.Rows()) do
    local key = r.need and (r.id or r.label)
    if key then low[key] = r.label .. " " .. r.value order[#order + 1] = key end
  end
  return low, order
end

-- Warns of the supplies that have just run low. A supply warns once: not again until it has
-- been back at its wanted count. The first look only notes what is already low (the door card
-- covers that). Not in combat: the check waits for the fight to end.
function PR.CheckSupplies()
  if ns.InCombat() then return ns.OutOfCombat(PR.CheckSupplies, "supplies") end
  local low, order = PR.LowSupplies()
  local before, fresh = PR.lowNow, {}
  PR.lowNow = low
  for _, key in ipairs(order) do
    if before and not before[key] then fresh[#fresh + 1] = low[key] end
  end
  if #fresh > 0 then ns.Chat("Running low: " .. table.concat(fresh, ", ") .. ".") end
end

-- Bags changed (or you came into a world): look at the supplies on the next frame, once.
function PR.OnBags()
  if PR.settings.lowWarn then ns.Soon("prep supplies", PR.CheckSupplies) end
end

-- /vg prep want <key> <n>: how many of food, bandages, potions, ammo or shards to carry.
local function setWant(rest)
  local key, n = rest:match("^want%s+(%a+)%s+(%d+)%s*$")
  if not (key and PR.WANTS[key]) then return ns.Chat("Usage: /vg prep want <food|bandages|potions|ammo|shards> <n>") end
  PR.settings.want[key] = tonumber(n)
  ns.Chat(string.format("Instance prep wants %d %s.", tonumber(n), key))
end

-- /vg prep [want <key> <n>]: the card now (after the fight, in one), or a wanted amount.
function PR.Command(rest)
  rest = rest or ""
  if not PR.settings then return ns.Chat("Instance prep is off (/vg > Modules).") end
  if rest:match("^want") then return setWant(rest) end
  ns.OutOfCombat(function() PR.Show(true) end, "prep")
end

-- Module entry point (Core/Modules.lua).
function PR.Enable(settings)
  PR.settings = settings
  buildCard()
  ns.On("PLAYER_ENTERING_WORLD", PR.OnEnter)
  ns.On("READY_CHECK", PR.OnReadyCheck)
  ns.On("BAG_UPDATE_DELAYED", PR.OnBags)
  ns.On("PLAYER_ENTERING_WORLD", function() PR.lowNow = nil PR.OnBags() end)
end
