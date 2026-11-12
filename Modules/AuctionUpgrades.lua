-- Auction helper, the Upgrades list (Modules/AuctionHelper.lua holds the
-- tabs, the search queue, the scan and the slash commands): an entry in the
-- Lists tab's pane, listing the armor and weapons a scan or an item
-- search saw that beat what you wear, judged by Gear upgrades' stat weights
-- for your class and role (Modules/Upgrades.lua, UP.Compare: rings and
-- trinkets against the weaker you wear, a two-hander against both hands,
-- gear you can't wear left alone). Every listing that gains at least
-- UP.MIN_PCT is a row, the biggest gain first (the cheapest among equals);
-- for an empty slot only the best listing (the highest score, the cheapest
-- among equals) is kept, so white gear never floods the list. Each row shows
-- the item, its slot, the gain and its price per unit; its tooltip is the
-- item's own (with the Upgrade line Gear upgrades adds); a click shows the
-- item in the game's own list, so buying stays in the game's hands. The
-- listings are judged again when what you wear or the weights change. Like
-- Deals they are kept for 30 minutes after the house closes, back at the same
-- realm and side's house, unless what you wear changes meanwhile.
--
-- Standing rules here: links come only from the scan (GetReplicateItemLink,
-- read for armor and weapons alone) and from item search results (itemLink);
-- browse results carry no link and are never judged; every price and count
-- goes through ns.PlainNumber; a scan's gear is judged a few at a time, a
-- frame apart; the only search is a click's, through AH.Queue; nothing buys.

local ADDON, ns = ...
local L = ns.L

local T, AP = ns.Theme, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

-- The Upgrades entry's pane key (no list name can have it), and its columns: the slot, the gain
-- and the price per unit.
AH.UPGRADES = "\1upgrades"
AH.UPGRADE_COLUMNS = { { key = "slot", title = L["Slot"], width = 80, side = "LEFT", role = "small", color = "text2" },
  { key = "gain", title = L["Gain"], width = 80, side = "RIGHT", role = "small", color = "good" },
  { key = "price", title = L["Unit price"], width = 100, side = "RIGHT", role = "number", color = "gold" }, name = L["Item"] }
-- How many of a scan's gear listings are judged a frame.
AH.JUDGE_ROWS = 100
-- The slots' names when the client has none (INVTYPE_HEAD and the rest are the game's own strings).
AH.SLOT_NAMES = { INVTYPE_HEAD = L["Head"], INVTYPE_NECK = L["Neck"], INVTYPE_SHOULDER = L["Shoulder"], INVTYPE_CHEST = L["Chest"], INVTYPE_ROBE = L["Chest"],
  INVTYPE_WAIST = L["Waist"], INVTYPE_LEGS = L["Legs"], INVTYPE_FEET = L["Feet"], INVTYPE_WRIST = L["Wrist"], INVTYPE_HAND = L["Hands"],
  INVTYPE_FINGER = L["Finger"], INVTYPE_TRINKET = L["Trinket"], INVTYPE_CLOAK = L["Back"], INVTYPE_WEAPON = L["One-Hand"],
  INVTYPE_WEAPONMAINHAND = L["Main Hand"], INVTYPE_2HWEAPON = L["Two-Hand"], INVTYPE_WEAPONOFFHAND = L["Off Hand"], INVTYPE_SHIELD = L["Off Hand"],
  INVTYPE_HOLDABLE = L["Held In Off-hand"], INVTYPE_RANGED = L["Ranged"], INVTYPE_RANGEDRIGHT = L["Ranged"], INVTYPE_THROWN = L["Thrown"], INVTYPE_RELIC = L["Relic"] }
-- The Upgrades entry's switch (Town and gear > Auction house): on, as Deals is.
AH.defaults.upgrades = true
-- The upgrades found lately by link: { link, id, key, price, pct, empty, slot, fill (its inventory slot, to pick
-- one fill a slot), score, found (when), stale }; and every gear listing seen (link -> price per unit), to judge again when what you wear changes.
AH.upgrades, AH.gearSeen, AH.gearKeys = {}, {}, {}
-- The weights the listings were judged with (nil while Gear upgrades is off); false until the first is judged.
AH.weightsUsed = false

-- Judging ------------------------------------------------------------------------------------

-- A slot's name: the game's string for the equip location, else ours.
local function slotName(loc)
  if type(loc) ~= "string" then return "" end
  return _G[loc] or AH.SLOT_NAMES[loc] or ""
end

-- A listing of gear (its link) at a price per unit as an upgrade, or nil: a gain of at least
-- UP.MIN_PCT over what you wear, or an empty slot it fills (then with its score, to pick the best
-- for the slot; 0 while the client hasn't loaded its stats); nil too while the Upgrades module is off.
function AH.Upgrade(link, price, found)
  local UP = ns.GetModule("Upgrades")
  if not UP.settings then return nil end
  local pct, empty = UP.Compare(link)
  if not empty and not (pct and pct >= UP.MIN_PCT) then return nil end
  local id, _, _, loc = C_Item.GetItemInfoInstant(link)
  local slots = UP.SLOTS[loc]
  return { link = link, id = id, key = C_AuctionHouse.MakeItemKey(id), price = price, pct = pct, empty = empty == true,
    slot = slotName(loc), fill = slots and slots[1] or 0, score = empty and (UP.Score(link, (UP.Current())) or 0) or nil, found = found }
end

-- Which item a gear link is: its ID, enchant, gems and suffix, without the per-listing unique ID
-- and level, so two listings of the same item and suffix share a key.
function AH.GearKey(link)
  return link:match("item:(%d+:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*)") or link
end

-- A gear listing claims its item's place: false when a listing of the same item at the same price
-- or less is held; otherwise a dearer one is dropped and the link is held.
local function claimGear(link, price)
  local key = AH.GearKey(link)
  local held = AH.gearKeys[key]
  if held and held ~= link then
    if AH.gearSeen[held] <= price then return false end
    AH.gearSeen[held], AH.upgrades[held] = nil, nil
  end
  AH.gearKeys[key] = link
  return true
end

-- The weights Gear upgrades judges with now, or nil while it is off.
local function currentWeights()
  local UP = ns.GetModule("Upgrades")
  return UP.settings and (UP.Current()) or nil
end

-- A gear listing seen (a scan's, or an item search's) while the house is open and the entry on:
-- kept to judge again, judged now, and the list repainted on the next frame. The same item
-- seen twice keeps its cheapest listing, and an upgrade seen before keeps the time it was found.
-- The first listing judged records the weights in use, so the first paint judges nothing again.
function AH.SeeGear(link, price)
  if not (AH.open and AH.settings.upgrades) or type(link) ~= "string" or not claimGear(link, price) then return end
  if AH.weightsUsed == false then AH.weightsUsed = currentWeights() end
  AH.gearSeen[link] = price
  local before = AH.upgrades[link]
  AH.upgrades[link] = AH.Upgrade(link, price, before and before.found or AP.Now())
  ns.Soon("auction upgrades", AH.PaintUpgrades)
end

-- Every gear listing seen, judged again (what you wear, or the weights, changed) on the judging walker,
-- AH.JUDGE_ROWS a frame: a copy of the listings goes to it, each marked to be judged at the price it is
-- held at when reached, so a listing dropped for a cheaper one mid-walk raises no error. Until the walker
-- reaches it, each upgrade is stale (judged against what you wore) and is not listed.
local function judgeAgain()
  local gear, again = {}, {}
  for link, price in pairs(AH.gearSeen) do gear[link], again[link] = price, true end
  for _, u in pairs(AH.upgrades) do u.stale = true end
  AH.JudgeGear(gear, again)
end

-- The weights in use changed since the listings were judged (your role, /vg weights): judged again.
local function judgeIfWeightsChanged()
  local current = currentWeights()
  if current == AH.weightsUsed then return end
  AH.weightsUsed = current
  judgeAgain()
end

-- Whether an item is armor or a weapon, by its class (C_Item.GetItemInfoInstant).
local function isGear(id)
  local class = select(6, C_Item.GetItemInfoInstant(id))
  return class == AP.ARMOR or class == AP.WEAPON
end

-- Sorting --------------------------------------------------------------------------------------

-- Which of two upgrades comes first: the bigger gain, then the cheaper, then by link.
local function byGain(a, b)
  if a.pct ~= b.pct then return a.pct > b.pct end
  if a.price ~= b.price then return a.price < b.price end
  return a.link < b.link
end

-- The better of two listings for an empty slot: the higher score, then the cheaper, then by link.
local function betterFill(a, b)
  if not a then return b end
  if a.score ~= b.score then return a.score > b.score and a or b end
  if a.price ~= b.price then return a.price < b.price and a or b end
  return a.link < b.link and a or b
end

-- The upgrades judged against what you wear now: a stale one (judgeAgain) is left out until it is judged again.
local function judgedUpgrades()
  local judged = {}
  for _, u in pairs(AH.upgrades) do
    if not u.stale then judged[#judged + 1] = u end
  end
  return judged
end

-- This visit's upgrades, best first: the gains by how much, then, slot by slot, the best listing
-- for each empty slot.
function AH.SortedUpgrades()
  local gains, fills, slots = {}, {}, {}
  for _, u in ipairs(judgedUpgrades()) do
    if u.empty then fills[u.fill] = betterFill(fills[u.fill], u) else gains[#gains + 1] = u end
  end
  table.sort(gains, byGain)
  for slot in pairs(fills) do slots[#slots + 1] = slot end
  table.sort(slots)
  for _, slot in ipairs(slots) do gains[#gains + 1] = fills[slot] end
  return gains
end

-- The feeds ------------------------------------------------------------------------------------

-- A gear listing's link at a price per unit joins the cheapest seen of its link (seen[link]).
local function cheapest(seen, link, price)
  if type(link) == "string" and (not seen[link] or price < seen[link]) then seen[link] = price end
end

-- A gear link at a price per unit joins the scan's gear (s.gear, link -> price) unless the scan holds a
-- listing of the same item (AH.GearKey, s.keys) at the same price or less; on a tie the smaller link
-- stays, as judging them in link order would pick. A scan of thousands of listings of the same few
-- hundred items so holds one link per item, not one per listing.
local function cheapestOfItem(s, link, price)
  local key = AH.GearKey(link)
  local held = s.keys[key]
  if held and (s.gear[held] < price or (s.gear[held] == price and held <= link)) then return end
  if held then s.gear[held] = nil end
  s.keys[key], s.gear[link] = link, price
end

-- A scan's listing i (AH.ScanRow) of armor or a weapon joins the scan's gear to judge (s.gear,
-- the cheapest per item), by its link (GetReplicateItemLink, read for gear alone) and unit price;
-- nothing on a client without the call.
function AH.ScanGear(s, i, id, unit)
  if not AH.settings.upgrades or type(C_AuctionHouse.GetReplicateItemLink) ~= "function" or not isGear(id) then return end
  local link = C_AuctionHouse.GetReplicateItemLink(i)
  if type(link) == "string" then cheapestOfItem(s, link, unit) end
end

-- The price the walker judges a link at: for a link judged again (judgeAgain), the price the link is held at
-- now (a listing seen again since the walk started), else the price it was handed.
local function walkPrice(j, link)
  return (j.again[link] and AH.gearSeen[link]) or j.gear[link]
end

-- One frame of judging: the next AH.JUDGE_ROWS of the scan's gear; the walker stops after the last.
local function judgeStep()
  local j = AH.judging
  if not j or not (AH.open and AH.settings.upgrades) then return AH.judge:Hide() end
  local last = math.min(j.next + AH.JUDGE_ROWS - 1, #j.links)
  for i = j.next, last do AH.SeeGear(j.links[i], walkPrice(j, j.links[i])) end
  j.next = last + 1
  if j.next > #j.links then AH.StopJudging() end
end

-- The links a walk still running had not reached join the gear to judge next (gear's own price wins, and
-- with it the link's mark in again), so a new walk drops none of them.
local function addPending(gear, again)
  local j = AH.judging
  for i = j and j.next or 1, j and #j.links or 0 do
    local link = j.links[i]
    if not gear[link] then gear[link], again[link] = j.gear[link], j.again[link] end
  end
end

-- The gear a scan found (AH.FinishScan; link -> cheapest unit price), or the listings judged again (again:
-- link -> true), judged AH.JUDGE_ROWS listings a frame on its own walker (by link, so the order holds), so a
-- big scan never stalls a frame; the links a walk still running had not reached are judged on the new one.
function AH.JudgeGear(gear, again)
  again = again or {}
  addPending(gear, again)
  local links = {}
  for link in pairs(gear) do links[#links + 1] = link end
  table.sort(links)
  if #links == 0 then return end
  AH.judging = { links = links, gear = gear, again = again, next = 1 }
  AH.judge:Show()
end

-- Judging ends (the last listing is judged, or the listings are forgotten).
function AH.StopJudging()
  AH.judging = nil
  AH.judge:Hide()
end

-- Judging pauses (the house closed): the walk and its place are kept for the next visit.
function AH.PauseJudging()
  AH.judge:Hide()
end

-- A paused walk goes on (the house opened, or the Upgrades switch came back on); it hides itself again if it must wait.
function AH.ResumeJudging()
  if AH.judging and AH.judge then AH.judge:Show() end
end

-- An item search row's buyout per unit, or nil when it is yours (or the client hides whether), has no buyout
-- or hides a number.
local function gearUnit(r)
  if type(r) ~= "table" or ns.IsSecret(r.containsOwnerItem) or r.containsOwnerItem then return nil end
  local buyout, qty = ns.PlainNumber(r.buyoutAmount), ns.PlainNumber(r.quantity)
  if buyout and qty and qty > 0 and buyout > 0 then return math.floor(buyout / qty) end
end

-- An item search's results (ITEM_SEARCH_RESULTS_UPDATED and ADDED, with the item key): for armor
-- or a weapon, each link is seen at its cheapest listing with a buyout, per unit (your own listings left out).
function AH.OnGearResults(_, key)
  local id = type(key) == "table" and ns.PlainNumber(key.itemID)
  if not id or not isGear(id) then return end
  local seen = {}
  for i = 1, ns.PlainNumber(C_AuctionHouse.GetNumItemSearchResults(key)) or 0 do
    local r = C_AuctionHouse.GetItemSearchResultInfo(key, i)
    local unit = gearUnit(r)
    if unit then cheapest(seen, r.itemLink, unit) end
  end
  for link, price in pairs(seen) do AH.SeeGear(link, price) end
end

-- Every upgrade and gear listing found is forgotten.
function AH.ForgetGear()
  AH.upgrades, AH.gearSeen, AH.gearKeys = {}, {}, {}
  AH.judging = nil
  -- The weights the listings were judged with (nil while Gear upgrades is off); false until the first is judged.
  AH.weightsUsed = false
end

-- What you wear changed: while the house is open every listing seen is judged again; while it is
-- closed the kept ones are forgotten (they were judged against what you wore).
local function onGearChanged()
  if not AH.open then return AH.ForgetGear() end
  judgeAgain()
  AH.PaintUpgrades()
end

-- The weights changed or Gear upgrades went off: while the house is open the list is judged again (a burst
-- is one paint, as for a new listing); a change made away from it waits for the next visit (AH.OnShow).
local function onUpgradeWeights()
  if AH.open then ns.Soon("auction upgrades", AH.PaintUpgrades) end
end

-- The Upgrades entry's events (on: the helper's): item search
-- results and closing the house (judging paused); your gear
-- changing, also in combat (the house is closed then, so that only forgets); the judging walker is made here.
function AH.ListenUpgrades(on)
  AH.judge = CreateFrame("Frame")
  AH.judge:Hide()
  AH.judge:SetScript("OnUpdate", judgeStep)
  on("ITEM_SEARCH_RESULTS_UPDATED", AH.OnGearResults)
  on("ITEM_SEARCH_RESULTS_ADDED", AH.OnGearResults)
  ns.On("PLAYER_EQUIPMENT_CHANGED", onGearChanged)
  ns.GetModule("Upgrades").OnChanged(onUpgradeWeights)
  ns.On("AUCTION_HOUSE_CLOSED", AH.PauseJudging) -- state only, so also in combat
end

-- The entry ------------------------------------------------------------------------------------

-- An upgrade's gain: "+12 %", or "empty slot" for one that fills a slot.
local function gainText(u)
  if u.empty then return L["empty slot"] end
  return string.format("+%d %%", math.floor(u.pct))
end

-- An upgrade's row: the item (its name from the link), its slot, the gain and the price per unit.
local function paintUpgrade(r, u)
  local icon = select(5, C_Item.GetItemInfoInstant(u.link))
  r.icon:SetTexture(icon or AH.UNKNOWN_ICON)
  r.name:SetText(u.link:match("%[(.-)%]") or u.link)
  r.cells.slot:SetText(u.slot)
  r.cells.gain:SetText(gainText(u))
  r.cells.price:SetText(AP.Money(u.price))
end

-- An upgrade clicked: its item in the game's own list (first in line), on its Buy tab, to buy there.
function AH.OpenUpgrade(r)
  if r.item then AH.QueueFirst({ open = r.item.key }) AH.ShowInGame() end
end

-- An upgrade's tooltip: the item's own (Gear upgrades adds its Upgrade line), and what a click does.
local function upgradeTip(r)
  GameTooltip:SetOwner(r, "ANCHOR_RIGHT")
  GameTooltip:SetHyperlink(r.item.link)
  AH.FoundLine(r.item)
  GameTooltip:AddLine(L["Click to show it in the auction house's list."], T.RGB("text2"))
  GameTooltip:Show()
end

-- The line shown while there are no upgrades: how they are found, or that Gear upgrades is off.
local function upgradeStatus(items)
  if #items > 0 then return "" end
  if not ns.GetModule("Upgrades").settings then return L["Turn on Gear upgrades (Town and gear) to judge gear."] end
  return L["None yet: a scan or an item search finds armor and weapons that beat what you wear."]
end

-- How many upgrades this visit lists, without sorting them: every gain, and one fill for each
-- empty slot (AH.SortedUpgrades keeps only the best fill of a slot).
function AH.UpgradeCount()
  local count, filled = 0, {}
  for _, u in ipairs(judgedUpgrades()) do
    if not u.empty then count = count + 1 elseif not filled[u.fill] then filled[u.fill], count = true, count + 1 end
  end
  return count
end

-- The pane's Upgrades entry with this visit's count, while the switch is on.
local function paneEntry()
  if AH.settings.upgrades then return { key = AH.UPGRADES, name = L["Upgrades"], count = AH.UpgradeCount() } end
end
AH.PANE_EXTRAS[#AH.PANE_EXTRAS + 1] = paneEntry

-- What the card shows for Upgrades: the columns, this visit's upgrades best first, the count
-- beside the heading, and the line shown while there are none.
AH.Sources[AH.UPGRADES] = { name = L["Upgrades"], on = function() return AH.settings.upgrades end, columns = AH.UPGRADE_COLUMNS, items = AH.SortedUpgrades, paint = paintUpgrade, click = AH.OpenUpgrade,
  enter = upgradeTip, status = upgradeStatus, count = AH.FoundCount }

-- The Upgrades entry painted: the listings judged again if the weights changed, its count in the
-- pane and, while it is the entry shown, its rows (the entry gives way to no list when its switch goes off).
function AH.PaintUpgrades()
  if not AH.shopCard then return end
  AH.ResumeJudging()
  judgeIfWeightsChanged()
  if not AH.settings.upgrades and AH.ListKey() == AH.UPGRADES then AP.Store().list = nil end
  AH.PaintShop()
end
