-- The errands of leveling, done for you:
--   * Train all: a button on the trainer's window that learns everything you
--     can afford, in one click, and says what it cost;
--   * keep stocked: a list of items and how many to carry (/vg stock); a
--     merchant who sells them tops you up, a stack at a time, while you can pay;
--   * flight timer: each flight's time is saved by route, and the next flight
--     on that route shows a bar counting down to landing;
--   * boat timer (off until switched on): the same for boats and zeppelins, in
--     Modules/ErrandsBoats.lua.
-- Every client call is looked up when used, so a missing one just switches
-- that errand off. Buying and training stop in combat.

local ADDON, ns = ...

local T = ns.Theme

local ER = ns.Module("Errands", {
  defaults = { trainAll = true, stock = true, flightTimer = true, stockList = {}, flights = {},
    boatTimer = false, boats = {}, boatLast = {} },
})

ER.TRAIN_STEPS, ER.BUY_EVERY = 30, 0.2
ER.FLIGHT_POLL, ER.FLIGHT_MAX, ER.TAKEOFF_WAIT = 0.5, 3600, 10
ER.BAR_W, ER.BAR_H = 200, 14

-- Helpers ------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- Exposed for Modules/ErrandsBoats.lua.
ER.ask = ask

-- Runs fn after a short wait (at once on a client without timers).
local function later(seconds, fn)
  if type(C_Timer) == "table" and type(C_Timer.After) == "function" then return C_Timer.After(seconds, ns.Guard("timer errands", fn)) end
  fn()
end

-- Money as text, the info strip's way.
local function money(copper)
  return ns.GetModule("InfoStrip").Money(copper)
end

-- Your money in copper (0 when the client can't say).
local function cash()
  return ns.PlainNumber(ask("GetMoney")) or 0
end

-- Train all ----------------------------------------------------------------------------------

-- Whether trainer service i can be learned now. The game's own order of
-- GetTrainerServiceInfo's results is name, kind, ...; an older client's is name, rank, kind.
local function available(i)
  local _, second, third = ask("GetTrainerServiceInfo", i)
  return not ns.IsSecret(second) and not ns.IsSecret(third) and (second == "available" or third == "available")
end

-- A service's name, to tell it from the others as the list re-indexes under the buying.
local function serviceName(i)
  local name = ask("GetTrainerServiceInfo", i)
  return type(name) == "string" and name or tostring(i)
end

-- Narrow enough to sit between the trainer's money line (bottom left) and its Train button.
ER.TRAIN_WIDTH = 96

-- The trainer's services you can learn now, as { index, cost, name }.
function ER.Trainable()
  local out = {}
  for i = 1, ns.PlainNumber(ask("GetNumTrainerServices")) or 0 do
    if available(i) then out[#out + 1] = { index = i, cost = ns.PlainNumber(ask("GetTrainerServiceCost", i)) or 0, name = serviceName(i) } end
  end
  return out
end

-- The first service you can afford, or nil. With a run: not one it already bought, and
-- with what it has spent counted off (the game updates your money and the list a moment later).
local function nextAffordable(run)
  for _, s in ipairs(ER.Trainable()) do
    if not (run and run.done[s.name]) and s.cost <= cash() - (run and run.spent or 0) then return s end
  end
end

-- The button's label (how many; its cost is told when it is clicked); it's off while nothing is affordable.
function ER.UpdateTrainButton()
  local b, list = ER.trainButton, ER.Trainable()
  if not b then return end
  b.text:SetText(#list > 0 and string.format("Train all (%d)", #list) or "Train all")
  if nextAffordable() then b:Enable() else b:Disable() end
  b:SetShown(ER.settings.trainAll)
end

-- Learns the next affordable service not yet bought in this click; false when
-- there is none (or the trainer closed, combat started, or the step cap is reached).
local function trainOne(run)
  local s = nextAffordable(run)
  if not s or not ER.trainerOpen or ns.InCombat() or run.count >= ER.TRAIN_STEPS then return false end
  ask("BuyTrainerService", s.index)
  run.done[s.name], run.count, run.spent = true, run.count + 1, run.spent + s.cost
  return true
end

-- The Train all button was clicked: learn everything affordable in a loop inside
-- the click (a purchase needs one), re-reading the list each time, and say what it cost.
function ER.TrainAll()
  if ns.InCombat() then return end
  local run = { done = {}, count = 0, spent = 0 }
  while trainOne(run) do end
  if run.count > 0 then ns.Chat(string.format("Trained %d skill(s) for %s.", run.count, money(run.spent))) end
  ER.UpdateTrainButton()
end

-- Puts the button left of the game's Train button, the same height so their edges line up.
function ER.PlaceBesides(b, train)
  b:SetPoint("RIGHT", train, "LEFT", -4, 0)
  b:SetHeight(train:GetHeight())
end

-- Adds the Train all button to the game's trainer window, once that window exists.
function ER.AddTrainButton()
  local frame = _G.ClassTrainerFrame
  if ER.trainButton or type(frame) ~= "table" then return end
  local b, train = ns.DialogButton(frame, "Train all", ER.TRAIN_WIDTH), _G.ClassTrainerTrainButton
  if type(train) == "table" then ER.PlaceBesides(b, train) else b:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", 8, 6) end
  b:SetScript("OnClick", ns.Guard("click train all", ER.TrainAll))
  ER.trainButton = b
  ER.UpdateTrainButton()
end

-- A trainer opened or closed: note it, and refresh the button.
local function trainerOpen(open)
  return function()
    ER.trainerOpen = open
    ER.AddTrainButton()
    ER.UpdateTrainButton()
  end
end

-- The trainer's window loads with its part of the game.
local function onLoaded(_, addon)
  if addon == "Blizzard_TrainerUI" then ER.AddTrainButton() end
end

-- Keep stocked: the list ---------------------------------------------------------------------

-- The item ID in an item link or "item:123" or a bare number at the start, or nil.
function ER.ItemID(text)
  if type(text) ~= "string" then return nil end
  return tonumber(text:match("item:(%d+)") or text:match("^%s*(%d+)"))
end

-- An item's name, when the client has it cached ("item 123" until then).
local function itemName(id)
  local info = C_Item and C_Item.GetItemInfo
  local name = type(info) == "function" and info(id)
  if type(name) == "string" then return name end
  return "item " .. id
end

-- " — sold by Thomas Miller (Elwynn Forest, Goldshire)": where Vendor memory last saw
-- the item sold, or "" (never seen, or Vendor memory is off).
local function soldBy(id)
  local VM = ns.GetModule("VendorMemory")
  local list = VM and VM.enabled and VM.Where(id)
  return list and (" — sold by " .. VM.Text(list[1])) or ""
end

-- Prints the stock list, with where to buy each item when that's known.
local function listStock()
  local ids = {}
  for id in pairs(ER.settings.stockList) do ids[#ids + 1] = id end
  if #ids == 0 then return ns.Chat("Your stock list is empty. /vg stock <item> <amount> adds one.") end
  table.sort(ids)
  for _, id in ipairs(ids) do ns.Chat(string.format("Keep %d × %s", ER.settings.stockList[id], itemName(id)) .. soldBy(id)) end
end

-- Sets how many of an item to keep (0 takes it off the list).
local function setStock(id, amount)
  ER.settings.stockList[id] = amount > 0 and amount or nil
  if amount > 0 then return ns.Chat(string.format("Keeping %d × %s.", amount, itemName(id))) end
  ns.Chat(itemName(id) .. " is off your stock list.")
end

-- /vg stock [<item> <amount> | clear]: list, set or clear the stock list.
function ER.StockCommand(rest)
  rest = rest or ""
  if rest == "" then return listStock() end
  if rest == "clear" then ER.settings.stockList = {} return ns.Chat("Your stock list is empty.") end
  local id, amount = ER.ItemID(rest), tonumber(rest:match("%s(%d+)%s*$"))
  if not (id and amount) then return ns.Chat("Usage: /vg stock <shift-click an item> <amount>  (0 removes it)") end
  setStock(id, amount)
end

-- Keep stocked: buying -----------------------------------------------------------------------

-- A merchant item's price, how many that price buys, how many are left (modern table, else the old call),
-- and whether it costs more than gold (the table says so; else the cost call).
local function merchantInfo(i)
  local api = C_MerchantFrame and C_MerchantFrame.GetItemInfo
  if type(api) == "function" then
    local info = api(i)
    if type(info) == "table" then return info.price, info.stackCount, info.numAvailable, info.hasExtendedCost == true end
  end
  local _, _, price, stack, left = ask("GetMerchantItemInfo", i)
  return price, stack, left, false
end

-- How many of an item you carry (nil when the client can't say).
local function owned(id)
  local count = C_Item and C_Item.GetItemCount
  return type(count) == "function" and ns.PlainNumber(count(id)) or nil
end

-- How many of merchant item i your list wants (0 for none), and its item ID.
local function wanted(i)
  local id = ER.ItemID(ask("GetMerchantItemLink", i))
  local goal = id and ER.settings.stockList[id]
  if not goal then return 0, id end
  return math.max(0, goal - (owned(id) or 0)), id
end

-- The order for merchant item i, or nil: an item your list wants, in stock, bought for gold alone
-- (an item priced in honor, badges or other items reads 0 copper and would be "bought" for nothing).
local function orderFor(i)
  local need, id = wanted(i)
  local price, stack, left, extended = merchantInfo(i)
  price, stack = ns.PlainNumber(price), math.max(ns.PlainNumber(stack) or 1, 1)
  if need <= 0 or not price or price <= 0 or extended or ns.GetModule("Merchant").ExtendedCost(i) or ns.PlainNumber(left) == 0 then return nil end
  return { index = i, id = id, need = need, unit = price / stack, stack = stack }
end

-- What this merchant can sell toward your list: { index, id, need, unit price, stack } per item.
function ER.Orders()
  local out = {}
  for i = 1, ns.PlainNumber(ask("GetMerchantNumItems")) or 0 do
    out[#out + 1] = orderFor(i)
  end
  return out
end

-- Notes a purchase, and drops the order once it's filled.
local function record(run, order, count, cost)
  order.need = order.need - count
  run.bought[order.id] = (run.bought[order.id] or 0) + count
  run.spent[order.id] = (run.spent[order.id] or 0) + cost
  if order.need <= 0 then table.remove(run.orders, 1) end
end

-- A purchase count rounded up to whole merchant stacks (ammo sells 200 at a time).
local function wholeStacks(count, stack)
  return math.ceil(count / stack) * stack
end

-- Buys the next chunk (a stack at most, in whole merchant stacks) of the first order if you can pay; false when done.
-- The game answers a buy later and says nothing when it fails, so the chunk is only noted as pending here
-- (with how many you carried): settle notes what really arrived.
local function buyChunk(run)
  local order = run.orders[1]
  if not order then return false end
  local count = wholeStacks(math.min(order.need, math.max(ns.PlainNumber(ask("GetMerchantItemMaxStack", order.index)) or 1, 1)), order.stack)
  if math.ceil(order.unit * count) > cash() then return false end
  run.pending = { order = order, count = count, before = owned(order.id) }
  ask("BuyMerchantItem", order.index, count)
  return true
end

-- Notes what the last purchase brought (how many more of the item you carry now, up to what was bought); false
-- when it fell short (bags full, a stock limit, not enough money), which ends the run. A client that can't
-- count items is trusted. Running it twice notes nothing the second time.
local function settle(run)
  local p = run.pending
  if not p then return true end
  run.pending = nil
  local now, got = owned(p.order.id), p.count
  if now and p.before then got = math.max(0, math.min(now - p.before, p.count)) end
  if got > 0 then record(run, p.order, got, math.ceil(p.order.unit * got)) end
  if got < p.count then run.short = p.order.id end
  return got == p.count
end

-- Says what a run bought, and which item stopped it short.
local function report(run)
  for id, n in pairs(run.bought) do ns.Chat(string.format("Bought %d × %s for %s.", n, itemName(id), money(run.spent[id]))) end
  if run.short then ns.Chat(string.format("Stopped buying %s: the last purchase did not arrive in full (bags full, a stock limit or not enough money?).", itemName(run.short))) end
end

-- Notes the last purchase, then buys a chunk and checks again shortly after; says what it bought once done
-- (or a purchase fell short, or out of money, or the merchant closed, or combat started).
function ER.StockNext()
  local run = ER.stocking
  if not run then return end
  local arrived = settle(run)
  if arrived and ER.merchantOpen and not ns.InCombat() and buyChunk(run) then return later(ER.BUY_EVERY, ER.StockNext) end
  ER.stocking = nil
  report(run)
end

-- A merchant opened: top up your stock list (not in combat).
local function onMerchant()
  ER.merchantOpen = true
  if not ER.settings.stock or ER.stocking or ns.InCombat() or next(ER.settings.stockList) == nil then return end
  ER.stocking = { orders = ER.Orders(), bought = {}, spent = {} }
  ER.StockNext()
end

-- Flight timer -------------------------------------------------------------------------------

-- The name of the flight point you're standing at, or nil.
local function currentNode()
  for i = 1, ns.PlainNumber(ask("NumTaxiNodes")) or 0 do
    local kind = ask("TaxiNodeGetType", i)
    if not ns.IsSecret(kind) and kind == "CURRENT" then return ask("TaxiNodeName", i) end
  end
end

-- You picked a destination: note the route, and check the taxi state twice a
-- second from now until the flight lands or is forgotten.
function ER.OnTakeTaxi(index)
  local from, to = currentNode(), ask("TaxiNodeName", index)
  if type(from) ~= "string" or type(to) ~= "string" then return end
  local key = from .. " > " .. to
  ER.flight = { key = key, to = to, picked = ask("GetTime") or 0, known = ER.settings.flights[key] }
  ns.Every("flight poll", ER.FLIGHT_POLL, ER.PollFlight)
end

-- Seconds as "1:05".
local function clock(seconds)
  seconds = math.max(0, math.ceil(seconds))
  return string.format("%d:%02d", math.floor(seconds / 60), seconds % 60)
end

-- The bar for a flight in the air: a countdown on a route flown before, else "timing".
function ER.PaintFlight(f)
  local bar, left = ER.bar, (f.known or 0) - ((ask("GetTime") or 0) - f.start)
  bar:Show()
  bar:SetMinMaxValues(0, f.known or 1)
  bar:SetValue(f.known and math.max(0, left) or 1)
  bar.text:SetText(f.known and (f.to .. "  " .. clock(left)) or ("Timing this flight to " .. f.to))
end

-- Landed: save the flight's time (a sane one) and put the bar away.
local function land(f)
  local took = (ask("GetTime") or 0) - f.start
  if took > 0 and took <= ER.FLIGHT_MAX then ER.settings.flights[f.key] = math.floor(took + 0.5) end
  ER.flight = nil
  ER.bar:Hide()
end

-- Follows a picked flight: takeoff starts the bar, landing saves the time; a
-- flight that never took off is forgotten. With no flight to follow, it stops.
function ER.PollFlight()
  local f, taxi, now = ER.flight, ask("UnitOnTaxi", "player"), ask("GetTime") or 0
  if not f then return ns.Every("flight poll", nil) end
  if ns.IsSecret(taxi) then return end
  local flying = taxi == true
  if f.start and not flying then return land(f) end
  if flying then f.start = f.start or now return ER.PaintFlight(f) end
  if now - f.picked > ER.TAKEOFF_WAIT then ER.flight = nil end
end

-- The movable flight bar, above the cluster, hidden until a flight.
local function buildBar()
  local bar = T.BarColor(T.StyleBar(CreateFrame("StatusBar", "Vanguard_FlightTimer", UIParent)), "accent")
  T.HudPanel(bar)
  bar:SetSize(ER.BAR_W, ER.BAR_H)
  ns.Mover(bar, "flighttimer", "Flight timer", { "BOTTOM", "BOTTOM", 0, 312 })
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), "barSmall")
  bar.text:SetPoint("CENTER")
  bar:Hide()
  ER.bar = bar
end

-- Times flights, where the client lets addons see you pick one.
local function watchFlights()
  if type(hooksecurefunc) ~= "function" or type(_G.TakeTaxiNode) ~= "function" then return end
  hooksecurefunc("TakeTaxiNode", ns.Guard("hook TakeTaxiNode", ER.OnTakeTaxi))
  buildBar()
end

-- Module entry point (Core/Modules.lua).
function ER.Enable(settings)
  ER.settings = settings
  ER.AddTrainButton()
  ns.On("ADDON_LOADED", onLoaded)
  ns.On("TRAINER_SHOW", trainerOpen(true))
  ns.On("TRAINER_CLOSED", trainerOpen(false))
  ns.On("TRAINER_UPDATE", ER.UpdateTrainButton)
  ns.On("MERCHANT_SHOW", onMerchant)
  ns.On("MERCHANT_CLOSED", function() ER.merchantOpen = false end)
  if settings.flightTimer then watchFlights() end
  if settings.boatTimer then ER.WatchBoats() end
end
