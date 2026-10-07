// errands: Train all, keep stocked, the flight timer and the merchant, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { UNITS_ENV, chatHas, loggedIn, setCombat } from "./helpers.mjs";
import { MERCHANT_ENV } from "./more-env.mjs";

// TEST-ONLY trainer: two services you can learn (5s and 20s), one you can't yet, one learned; 22s on hand.
const TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Old", "used", 0 } }
  __money, __learned = 2200, {}
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], "", s[2], false end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] __money = __money - __services[i][3] __services[i][2] = "used" end
  C_Timer = { After = function(_, fn) fn() end }
  function __loadTrainer(withTrain)
    ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
    if withTrain then ClassTrainerTrainButton = CreateFrame("Button", "ClassTrainerTrainButton", ClassTrainerFrame) end
  end
`;

// The Train all button: its label, whether it's enabled, and where it sits.
const trainButton = (addon) => addon.eval(`local b = ns.GetModule("Errands").trainButton
  if not b then return false end
  local p = b.__points.RIGHT or b.__points.BOTTOMLEFT
  return { text = b.text:GetText(), enabled = b:IsEnabled(), shown = b:IsShown(), by = p.rel:GetName() }`);

it("Train all at a trainer: learns what you can afford, one at a time", () => {
  const addon = loggedIn(TRAINER_ENV);
  expect(trainButton(addon), "no trainer window yet, no button").toBe(false);
  addon.eval("__loadTrainer(true)");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  addon.fire("TRAINER_SHOW");
  expect(trainButton(addon), "on the trainer's window, beside its own Train button, with the count and cost").toEqual({ text: "Train all (2) · 25s 0c", enabled: true, shown: true, by: "ClassTrainerTrainButton" });
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "learns what 22s pays for, then stops").toEqual(["TEST-ONLY Bolt"]);
  expect(chatHas(addon, /Trained 1 skill\(s\) for 5s 0c\./), "and says what it cost").toBe(true);
  expect(trainButton(addon).enabled, "the one left costs more than you have").toBe(false);
  addon.eval("__money = 5000");
  addon.fire("TRAINER_UPDATE");
  setCombat(addon, true);
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nothing in combat").toBe(1);
  setCombat(addon, false);
  addon.fire("TRAINER_CLOSED");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nor once the trainer closed").toBe(1);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect([addon.eval("return __learned"), trainButton(addon).text], "then the rest").toEqual([["TEST-ONLY Bolt", "TEST-ONLY Blast"], "Train all"]);
  const loaded = loggedIn(TRAINER_ENV + "__loadTrainer(false)", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { trainAll = false } } }" });
  loaded.fire("TRAINER_SHOW");
  expect(trainButton(loaded), "a window already loaded gets it too; switched off it hides").toMatchObject({ shown: false, by: "ClassTrainerFrame" });
});

// TEST-ONLY trainer as the game reports it: GetTrainerServiceInfo is name, kind, texture, ...; buying
// changes nothing until the server answers (money and list as they were), or removes the service from the list.
const FOREVER_TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Gust", "available", 1000 } }
  __money, __learned, __shrink = 3200, {}, false
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], s[2], 134400, 1, "Rank 1" end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] if __shrink then table.remove(__services, i) end end
  ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
`;

it("Train all in one click: no purchase twice, the budget counted before the game answers, a list that re-indexes", () => {
  const addon = loggedIn(FOREVER_TRAINER_ENV);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "32s on hand, game still showing everything: Bolt (5s) and Blast (20s), not Gust (10s: only 7s left), none twice").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast"]);
  expect(chatHas(addon, /Trained 2 skill\(s\) for 25s 0c\./), "one line for the whole click").toBe(true);
  const shrinking = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000");
  shrinking.fire("TRAINER_SHOW");
  shrinking.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(shrinking.eval("return __learned"), "the list shrinking under the buying (indexes shifting) skips and repeats nothing").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast", "TEST-ONLY Gust"]);
  const capped = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000 ns.GetModule('Errands').TRAIN_STEPS = 2");
  capped.fire("TRAINER_SHOW");
  capped.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(capped.eval("return #__learned"), "a click learns at most TRAIN_STEPS services").toBe(2);
});

// TEST-ONLY merchant stock: 90011 sells singly (5c, stacks of 20), 90012 in fives (40c for 5), 90013 is sold out.
const STOCK_ENV = `
  __goods = { { id = 90011, price = 5, stack = 1, left = -1, max = 20 }, { id = 90012, price = 40, stack = 5, left = -1, max = 10 }, { id = 90013, price = 1, stack = 1, left = 0, max = 20 } }
  __have, __buys, __money = { [90011] = 5 }, {}, 100000
  GetMoney = function() return __money end
  GetMerchantNumItems = function() return #__goods end
  GetMerchantItemLink = function(i) return "|cffffffff|Hitem:" .. __goods[i].id .. "::|h[TEST-ONLY Good]|h|r" end
  GetMerchantItemMaxStack = function(i) return __goods[i].max end
  C_MerchantFrame = { GetItemInfo = function(i) local g = __goods[i] return { price = g.price, stackCount = g.stack, numAvailable = g.left } end }
  BuyMerchantItem = function(i, n) local g = __goods[i] __buys[#__buys + 1] = { g.id, n } __have[g.id] = (__have[g.id] or 0) + n __money = __money - math.ceil(g.price / g.stack * n) end
  C_Item = { GetItemCount = function(id) return __have[id] or 0 end, GetItemInfo = function(id) if id == 90011 then return "TEST-ONLY Bread" end end }
  C_Timer = { After = function(_, fn) fn() end }
`;

it("keep stocked: /vg stock sets the list, a merchant tops you up", () => {
  const addon = loggedIn(STOCK_ENV);
  addon.slash("stock");
  expect(chatHas(addon, /stock list is empty/), "an empty list says how to add").toBe(true);
  addon.slash("stock |cffffffff|Hitem:90011::|h[TEST-ONLY Bread]|h|r 45");
  addon.slash("stock item:90012 12");
  addon.slash("stock 90013 3");
  addon.slash("stock 90014");
  expect(chatHas(addon, /Keeping 45 × TEST-ONLY Bread\./) && chatHas(addon, /Usage: \/vg stock/), "a shift-clicked item and an amount; no amount, the usage").toBe(true);
  addon.slash("stock");
  expect(chatHas(addon, /Keep 12 × item 90012/), "the list, by name where the game knows it").toBe(true);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "40 more bread in stacks of 20, 12 of the fives rounded up to whole fives, nothing sold out").toEqual([[90011, 20], [90011, 20], [90012, 10], [90012, 5]]);
  expect(chatHas(addon, /Bought 40 × TEST-ONLY Bread for 2s 0c\./) && chatHas(addon, /Bought 15 × item 90012 for 1s 20c\./), "and says what it bought").toBe(true);
  addon.eval("__buys = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__buys"), "nothing when you have enough").toBe(0);
  addon.eval("__have = {} __buys = {} __money = 150");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "it stops when you can't pay for the next stack").toEqual([[90011, 20]]);
  addon.fire("MERCHANT_CLOSED");
  addon.slash("stock item:90011 0");
  addon.slash("stock clear");
  expect(chatHas(addon, /TEST-ONLY Bread is off your stock list/) && addon.eval("return next(VanguardDB.profiles.Default.Errands.stockList)") === null, "0 removes an item, clear empties the list").toBe(true);
  const old = loggedIn(STOCK_ENV + "C_Timer = nil C_MerchantFrame = nil GetMerchantItemInfo = function(i) local g = __goods[i] return 'x', '', g.price, g.stack, g.left end", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90012] = 5 } } } }" });
  old.fire("MERCHANT_SHOW");
  expect(old.eval("return __buys"), "a client with the old merchant call (and no timers)").toEqual([[90012, 5]]);
  const off = loggedIn(STOCK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stock = false, stockList = { [90012] = 5 } } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return #__buys"), "switched off it buys nothing").toBe(0);
});

it("keep stocked: an item sold in stacks (ammo) is bought in whole stacks", () => {
  const addon = loggedIn(STOCK_ENV + "__goods[4] = { id = 90014, price = 100, stack = 200, left = -1, max = 200 }", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90014] = 450 } } } }" });
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "450 wanted: two full stacks and the last 50 rounded up to a whole stack of 200").toEqual([[90014, 200], [90014, 200], [90014, 200]]);
  expect(chatHas(addon, /Bought 600 × item 90014 for 3s 0c\./), "and it says what it really bought").toBe(true);
});

// TEST-ONLY flight points: you stand at node 1, node 2 is a destination.
const TAXI_ENV = `
  __onTaxi = false
  hooksecurefunc = function(name, fn) local orig = _G[name] _G[name] = function(...) orig(...) fn(...) end end
  NumTaxiNodes = function() return 2 end
  TaxiNodeGetType = function(i) return i == 1 and "CURRENT" or "REACHABLE" end
  TaxiNodeName = function(i) return i == 1 and "TEST-ONLY Landing" or "TEST-ONLY Outpost" end
  TakeTaxiNode = function() end
  UnitOnTaxi = function() return __onTaxi end
`;

// The flight bar: shown, its text, value and max.
const flightBar = (addon) => addon.eval("local b = Vanguard_FlightTimer return { shown = b:IsShown(), text = b.text:GetText(), value = b:GetValue(), max = select(2, b:GetMinMaxValues()) }");

it("flight timer: the first flight is timed, the next counts down", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV);
  expect(flightBar(addon).shown, "no bar until a flight").toBe(false);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  expect(flightBar(addon), "a route never flown: timing it").toMatchObject({ shown: true, text: "Timing this flight to TEST-ONLY Outpost" });
  addon.eval("__wfgStub.advance(90) __onTaxi = false __wfgStub.advance(1)");
  expect([flightBar(addon).shown, addon.eval('return VanguardDB.profiles.Default.Errands.flights["TEST-ONLY Landing > TEST-ONLY Outpost"]')], "landing saves the time and hides the bar").toEqual([false, 91]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  addon.eval("__wfgStub.advance(30)");
  expect(flightBar(addon), "the same route again counts down").toMatchObject({ shown: true, text: "TEST-ONLY Outpost  1:01", max: 91 });
  addon.eval("__onTaxi = false __wfgStub.advance(1)");
  addon.eval("TakeTaxiNode(2) __wfgStub.advance(12)");
  expect(addon.eval('return ns.GetModule("Errands").flight'), "a flight that never takes off is forgotten").toBe(null);
  addon.eval('TaxiNodeGetType = function() return { __secret = true } end TakeTaxiNode(2)');
  expect(addon.eval('return ns.GetModule("Errands").flight'), "no route when the start is hidden").toBe(null);
  expect(addon.eval("return { ns.MoverPoint('flighttimer') }"), "the bar is movable, above the cluster").toEqual(["BOTTOM", "BOTTOM", 0, 312]);
  const bare = loggedIn("");
  expect(bare.eval("return Vanguard_FlightTimer == nil and ns.GetModule('Errands').settings ~= nil"), "a client without taxi calls loads cleanly").toBe(true);
});

it("at a merchant: repair with your own gold, sell junk", () => {
  const addon = loggedIn(MERCHANT_ENV);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __repairs"), "repairs with your own gold, not the guild's").toEqual([false]);
  expect(chatHas(addon, /Repaired for 50s 0c/) && chatHas(addon, /Selling 1 junk item/), "and says so").toBe(true);
  expect(addon.eval("return { __used, __bag[1] == nil }"), "the gray item is sold, tried again when the first try didn't take").toEqual([[1, 1], true]);
  addon.eval("__gold = 100 __repairs = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__repairs") === 0 && chatHas(addon, /Not enough gold to repair/), "no repair you can't pay for").toBe(true);
  addon.eval("__cost = 0");
  addon.fire("MERCHANT_SHOW");
  addon.eval("__canRepair = false");
  addon.fire("MERCHANT_SHOW");
  addon.eval("C_MerchantFrame = { SellAllJunkItems = function() __all = true end }");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __all"), "the client's own one-step sale where it has one").toBe(true);
  const off = loggedIn(MERCHANT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Merchant = { repair = false, junk = false, errors = false } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return { #__repairs, #__used, UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE') }"), "each part can be turned off").toEqual([0, 0, true]);
  const bare = loggedIn("CanMerchantRepair = nil");
  bare.fire("MERCHANT_SHOW");
  expect(bare.eval("return ns.GetModule('Merchant').Noisy('x')"), "a client without these calls does nothing").toBe(false);
});

it("flight timer: the taxi check runs only from picking a flight until it lands", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV + "__asked = 0 local real = UnitOnTaxi UnitOnTaxi = function(...) __asked = __asked + 1 return real(...) end");
  // How often the taxi state was asked so far, then reset.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  addon.advance(60);
  expect([asked(), addon.eval('return ns.GetModule("Errands").poller:IsShown()')], "a minute on the ground with no flight picked: never asked").toEqual([0, false]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true");
  addon.advance(5);
  expect([asked(), flightBar(addon).shown], "in the air: asked twice a second, the bar up").toEqual([10, true]);
  addon.eval("__onTaxi = false");
  addon.advance(1);
  expect([addon.eval('return ns.GetModule("Errands").poller:IsShown()'), flightBar(addon).shown], "landed: the check stops").toEqual([false, false]);
  asked();
  addon.advance(30);
  expect(asked(), "and stays stopped").toBe(0);
});
