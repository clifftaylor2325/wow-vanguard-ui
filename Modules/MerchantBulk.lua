-- Bulk selling and buying at a merchant, part of the Merchant module (Modules/Merchant.lua):
--   * a sell list (/vg junk): items you never want, sold with your grays when you open a merchant
--     (off until switched on), after a question that lists them and what they fetch;
--   * sell all of one item (/vg sell <item>): every stack of it in your bags, the same question;
--   * Stack and Max buttons on the game's quantity window for a merchant's item, with a line saying
--     what Max costs, and a question before buying more than a stack.
-- Items in an equipment set are never sold from here, and nothing is sold or bought in combat or
-- once the merchant has closed (using an item with no merchant open would use it). Buying and
-- selling only start from a click, a command or an answered question; the Buyback tab undoes a sale.

local ADDON, ns = ...

local T = ns.Theme
local W = ns.Widgets
local MC = ns.GetModule("Merchant")

MC.BUY_EVERY, MC.LIST_SHOWN = 0.2, 5
local vgSplit = ns.FrameState("vgSplitBulk")

-- Helpers ------------------------------------------------------------------------------------

-- Money as text, the info strip's way.
local function money(copper)
  return ns.GetModule("InfoStrip").Money(copper)
end

-- Calls a client function by name; nil when this client doesn't have it.
local ask = ns.CallGlobal

-- Runs fn after a short wait (at once on a client without timers).
local function later(seconds, fn)
  if type(C_Timer) == "table" and type(C_Timer.After) == "function" then return C_Timer.After(seconds, ns.Guard("timer merchant bulk", fn)) end
  fn()
end

-- The item ID in an item link or "item:123" or a bare number at the start, or nil.
function MC.ItemID(text)
  if type(text) ~= "string" then return nil end
  return tonumber(text:match("item:(%d+)") or text:match("^%s*(%d+)"))
end

-- An item's name, when the client has it cached ("item 123" until then).
local itemName = ns.ItemName

-- True while you can sell or buy: a merchant is open and you are not in a fight (also used by Merchant.lua's junk sale).
local function trading()
  return MC.open == true and not ns.InCombat()
end
MC.Trading = trading

-- What one of an item fetches at a vendor (0 when the client doesn't know).
local function sellPrice(id)
  local info = C_Item and C_Item.GetItemInfo
  return ns.PlainNumber(type(info) == "function" and select(11, info(id))) or 0
end

-- Selling ------------------------------------------------------------------------------------

-- The item IDs in your equipment sets, which are never sold from the list.
local function setItems()
  local api, out = _G.C_EquipmentSet, {}
  if type(api) ~= "table" or type(api.GetEquipmentSetIDs) ~= "function" or type(api.GetItemIDs) ~= "function" then return out end
  for _, set in ipairs(api.GetEquipmentSetIDs() or {}) do
    for _, id in pairs(api.GetItemIDs(set) or {}) do out[id] = true end
  end
  return out
end

-- The bag slot's item ID and stack size when the client says them plainly (not locked), else nil.
local function slotItem(bag, slot)
  local info = C_Container.GetContainerItemInfo(bag, slot)
  if type(info) ~= "table" or ns.IsSecret(info.isLocked) or info.isLocked then return nil end
  local id, count = ns.PlainNumber(info.itemID), ns.PlainNumber(info.stackCount)
  if id then return id, count or 1 end
end

-- Every bag slot whose item keep(id) accepts, as { bag, slot, id, count }.
local function scan(keep)
  local out = {}
  for bag = 0, 4 do
    for slot = 1, ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      local id, count = slotItem(bag, slot)
      if id and keep(id) then out[#out + 1] = { bag = bag, slot = slot, id = id, count = count } end
    end
  end
  return out
end

-- The slots holding items on your sell list, or of the one item given, without the equipment sets' items.
function MC.Listed(only)
  local worn, list = setItems(), MC.settings.junkList
  return scan(function(id) return not worn[id] and (only and id == only or (not only and list[id] == true)) end)
end

-- What the slots fetch in all, in copper.
function MC.Worth(rows)
  local total = 0
  for _, r in ipairs(rows) do total = total + sellPrice(r.id) * r.count end
  return total
end

-- Sells the slots find() gives, and again shortly after for what is left (the server limits how fast
-- items sell), while the merchant stays open.
function MC.SellRows(find, tries)
  if not trading() then return end
  local rows = find()
  for _, r in ipairs(rows) do C_Container.UseContainerItem(r.bag, r.slot) end
  if #rows > 0 and tries > 1 then later(MC.RETRY_AFTER, function() MC.SellRows(find, tries - 1) end) end
end

-- One "N × Name" line per item in the slots, in bag order.
local function itemLines(rows)
  local count, order = {}, {}
  for _, r in ipairs(rows) do
    if not count[r.id] then count[r.id], order[#order + 1] = 0, r.id end
    count[r.id] = count[r.id] + r.count
  end
  for i, id in ipairs(order) do order[i] = string.format("%d × %s", count[id], itemName(id)) end
  return order
end

-- The first few lines, then "and N more".
local function shortList(lines)
  local shown = {}
  for i = 1, math.min(#lines, MC.LIST_SHOWN) do shown[i] = lines[i] end
  if #lines > #shown then shown[#shown + 1] = string.format("and %d more", #lines - #shown) end
  return shown
end

-- "Sell for 1g 2s?" and up to five of the items by name, one to a line.
function MC.SellQuestion(rows)
  return string.format("Sell for %s?\n%s", money(MC.Worth(rows)), table.concat(shortList(itemLines(rows)), "\n"))
end

-- A finder of the shown rows that still hold what was shown (the same item, the same count): a stack
-- picked up or unlocked since the question opened is never sold, nor is a slot that now holds another item.
local function stillShown(rows)
  return function()
    local out = {}
    for _, r in ipairs(rows) do
      local id, count = slotItem(r.bag, r.slot)
      if id == r.id and count == r.count then out[#out + 1] = r end
    end
    return out
  end
end

-- Asks (a "danger" question, so Enter alone never answers it), then sells the rows that were shown and
-- no others; says what the Buyback tab can undo.
function MC.OfferSale(find)
  local rows = find()
  if #rows == 0 then return false end
  ns.Ask(MC.SellQuestion(rows), "Sell", function()
    if not trading() then return ns.Chat("Nothing sold: the merchant is closed.") end
    MC.SellRows(stillShown(rows), MC.RETRIES)
    ns.Chat(string.format("Selling %d stack(s) for %s. The merchant's Buyback tab gets them back.", #rows, money(MC.Worth(rows))))
  end, nil, "danger")
  return true
end

-- The merchant opened: offer your sell list's items (if switched on, out of combat).
function MC.OfferList()
  if not (MC.settings.listSell and next(MC.settings.junkList)) or ns.InCombat() then return end
  MC.OfferSale(MC.Listed)
end

-- The sell list --------------------------------------------------------------------------------

-- Prints the sell list.
local function listJunk()
  local ids = {}
  for id in pairs(MC.settings.junkList) do ids[#ids + 1] = id end
  if #ids == 0 then return ns.Chat("Your sell list is empty. /vg junk <shift-click an item> adds one.") end
  table.sort(ids)
  for _, id in ipairs(ids) do ns.Chat("Sell list: " .. itemName(id)) end
end

-- Puts an item on the sell list, or takes it off.
local function setJunk(id, on)
  MC.settings.junkList[id] = on or nil
  ns.Chat(itemName(id) .. (on and " is on your sell list." or " is off your sell list.") .. (on and not MC.settings.listSell and " Switch it on under Town and gear, Merchants." or ""))
end

-- /vg junk [<item> | remove <item> | clear]: show, add to, take from or empty the sell list.
function MC.JunkCommand(rest)
  rest = (rest or ""):match("^%s*(.-)%s*$")
  if rest == "" then return listJunk() end
  if rest == "clear" then MC.settings.junkList = {} return ns.Chat("Your sell list is empty.") end
  local removing = rest:match("^remove%s+(.+)")
  local id = MC.ItemID(removing or rest)
  if not id then return ns.Chat("Usage: /vg junk <shift-click an item>, /vg junk remove <item>, /vg junk clear") end
  setJunk(id, not removing)
end

-- /vg sell <item>: sell every stack of an item in your bags (at a merchant), after a question.
function MC.SellCommand(rest)
  local id = MC.ItemID(rest)
  if not id then return ns.Chat("Usage: /vg sell <shift-click an item>  (at a merchant)") end
  if not trading() then return ns.Chat("Open a merchant first.") end
  if not MC.OfferSale(function() return MC.Listed(id) end) then ns.Chat("You have no " .. itemName(id) .. " to sell.") end
end

-- Buying ---------------------------------------------------------------------------------------

-- True when merchant item index costs more than gold (honor, badges, other items): such an item is never bought
-- here or by Errands' stock list, whatever its copper price reads. A client that doesn't say counts as gold only.
function MC.ExtendedCost(index)
  local count = ns.PlainNumber(ask("GetMerchantItemCostInfo", index))
  return count ~= nil and count > 0
end

-- A merchant item's price per pack, pack size and stock left (-1 for no limit), or nil for one that
-- can't be bought for gold alone.
local function wares(index)
  local _, _, price, quantity, left = ask("GetMerchantItemInfo", index)
  price, quantity, left = ns.PlainNumber(price), ns.PlainNumber(quantity) or 1, ns.PlainNumber(left) or -1
  if price and price > 0 and not MC.ExtendedCost(index) then return price, math.max(quantity, 1), left end
end

-- Room for items in your bags: free slots, times how many of the item stack.
local function bagRoom(link)
  local free = 0
  for bag = 0, 4 do free = free + (ns.PlainNumber((C_Container.GetContainerNumFreeSlots(bag))) or 0) end
  local stack = ns.PlainNumber(select(8, C_Item.GetItemInfo(link or ""))) or 1
  return free * stack
end

-- How many packs of merchant item index you can buy: gold, stock and bag room limit it. 0 when none.
function MC.MaxPacks(index)
  local price, quantity, left = wares(index)
  if not price then return 0 end
  local packs = math.floor((ns.PlainNumber(GetMoney()) or 0) / price)
  if left >= 0 then packs = math.min(packs, left) end
  return math.max(math.min(packs, math.floor(bagRoom(ask("GetMerchantItemLink", index)) / quantity)), 0)
end

-- True when the merchant's item at index is still item id: a buy goes by index, and the next merchant
-- (opened before a timer or a question ran) may have something else there. Errands' stock runs use it too.
function MC.Sells(index, id)
  return MC.ItemID(ask("GetMerchantItemLink", index)) == id
end

-- Buys the next chunk of a run (a merchant stack at most, in whole packs); false when it can't go on
-- (the run's merchant closed, or what it sells at that index changed).
local function buyChunk(run)
  local price, quantity = wares(run.index)
  if not price or run.packs <= 0 or run.stopped or not trading() or not MC.Sells(run.index, run.id) then return false end
  local per = math.max(math.floor((ns.PlainNumber(ask("GetMerchantItemMaxStack", run.index)) or quantity) / quantity), 1)
  local packs = math.min(run.packs, per)
  if packs * price > (ns.PlainNumber(GetMoney()) or 0) then return false end
  ask("BuyMerchantItem", run.index, packs * quantity)
  run.packs, run.bought, run.spent = run.packs - packs, run.bought + packs * quantity, run.spent + packs * price
  return true
end

-- Buys a chunk, then the next shortly after; says what it bought once done (or out of money, or the
-- merchant closed, or combat started).
function MC.BuyNext(run)
  if buyChunk(run) then return later(MC.BUY_EVERY, function() MC.BuyNext(run) end) end
  if MC.buying == run then MC.buying = nil end
  if run.bought > 0 then ns.Chat(string.format("Bought %d × %s for %s.", run.bought, itemName(run.id or 0), money(run.spent))) end
end

-- Starts buying packs of merchant item index; one run at a time.
function MC.Buy(index, packs)
  if MC.buying or packs <= 0 or not trading() then return end
  local _, quantity = wares(index)
  local id = MC.ItemID(ask("GetMerchantItemLink", index))
  MC.buying = { index = index, id = id, packs = packs, bought = 0, spent = 0, quantity = quantity }
  MC.BuyNext(MC.buying)
end

-- The packs one click of Stack buys: one merchant stack's worth, or all that is possible if less.
function MC.StackPacks(index)
  local _, quantity = wares(index)
  if not quantity then return 0 end
  local per = math.max(math.floor((ns.PlainNumber(ask("GetMerchantItemMaxStack", index)) or quantity) / quantity), 1)
  return math.min(per, MC.MaxPacks(index))
end

-- The answer to a Buy question: buys the packs when the merchant is still open and still sells, at index,
-- the item asked about (id) at the same pack price; a question left open past its merchant buys nothing.
local function buyAsked(index, packs, id, price)
  local same = trading() and MC.Sells(index, id) and wares(index) == price
  if not same then return ns.Chat("Nothing bought: the merchant closed or changed what it sells.") end
  MC.Buy(index, packs)
end

-- Buys packs after a question when it is more than one merchant stack; hides the quantity window.
function MC.Order(index, packs, frame)
  if packs <= 0 then return end
  local price, quantity = wares(index)
  local id = MC.ItemID(ask("GetMerchantItemLink", index))
  if frame and frame.Hide then frame:Hide() end
  if packs <= MC.StackPacks(index) then return MC.Buy(index, packs) end
  ns.Ask(string.format("Buy %d × %s for %s?", packs * quantity, itemName(id or 0), money(packs * price)), "Buy", function() buyAsked(index, packs, id, price) end)
end

-- The quantity window ----------------------------------------------------------------------------

-- The merchant item the quantity window is for (its button's number), or nil for any other item.
function MC.SplitIndex(frame)
  local owner = type(frame) == "table" and frame.owner
  if type(owner) ~= "table" or not owner.GetName or not owner.GetID then return nil end
  local name = owner:GetName()
  if type(name) == "string" and name:match("^MerchantItem%d+ItemButton$") then return ns.PlainNumber(owner:GetID()) end
end

-- Writes what Max would buy under the quantity window's amount.
local function costLine(entry, index)
  local packs = MC.MaxPacks(index)
  local price, quantity = wares(index)
  entry.line:SetText(packs > 0 and string.format("Max %d for %s", packs * quantity, money(packs * price)) or "Can't afford one")
end

-- The window's Stack and Max buttons and the cost line, made once.
local function makeBulk(frame)
  local entry = { line = T.Text(frame:CreateFontString(nil, "OVERLAY"), "barSmall", "muted") }
  entry.stack = W.Button(frame, "Stack", function() MC.Order(entry.index, MC.StackPacks(entry.index), frame) end, 60)
  entry.max = W.Button(frame, "Max", function() MC.Order(entry.index, MC.MaxPacks(entry.index), frame) end, 60)
  entry.stack:SetPoint("TOPLEFT", frame, "BOTTOMLEFT", 0, -T.SPACE.gap)
  entry.max:SetPoint("LEFT", entry.stack, "RIGHT", T.SPACE.gap, 0)
  entry.line:SetPoint("TOPLEFT", entry.stack, "BOTTOMLEFT", 0, -T.SPACE.gap)
  return entry
end

-- The quantity window opened: for a merchant's item show Stack, Max and the cost line; else hide them.
function MC.OnSplitShow(frame)
  local entry, index = vgSplit[frame], MC.SplitIndex(frame)
  local on = MC.settings and MC.settings.bulkBuy and index ~= nil and trading() and wares(index) ~= nil
  if on and not entry then entry = makeBulk(frame) vgSplit[frame] = entry end
  if not entry then return end
  entry.index = index
  for _, part in ipairs({ entry.stack, entry.max, entry.line }) do part:SetShown(on) end
  if on then costLine(entry, index) end
end

-- Hooks the quantity window (once), when the game has made it.
function MC.HookSplit()
  local frame = _G.StackSplitFrame
  if type(frame) ~= "table" or not frame.HookScript or MC.splitHooked then return end
  MC.splitHooked = true
  frame:HookScript("OnShow", ns.Guard("stack split bulk", MC.OnSplitShow))
end

-- The merchant opened or closed. Closing ends a running buy for good: its next chunk buys nothing,
-- even when another merchant opens before it comes round.
function MC.SetOpen(open)
  MC.open = open
  if open then return MC.HookSplit() end
  if MC.buying then MC.buying.stopped = true end
  MC.buying = nil
end
