// errandsfixes: the H44 wave 23 fixes to Errands (Train all, Keep stocked) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY trainer as WoW Forever reports it (name, kind, texture, level, rank text); buying only asks, the
// test plays the server's answer by changing __services.
const RANK_TRAINER = `
  __services = { { "TEST-ONLY Fireball", "available", 500, "Rank 1" }, { "TEST-ONLY Fireball", "unavailable", 900, "Rank 2" } }
  __money, __learned = 100000, {}
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], s[2], 134400, 1, s[4] end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = i end
  Enum.TrainerType = { General = 0, Tradeskills = 2, Pet = 3 }
  C_Trainer = { GetTrainerType = function() return 0 end }
  ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
`;
// Presses the Train all button.
const trainAll = (addon) => addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');

it("H44-23-100: Train all counts a rank as learned when the next rank of the same name opens up", () => {
  const addon = loggedIn(RANK_TRAINER);
  addon.fire("TRAINER_SHOW");
  trainAll(addon);
  addon.eval("__services[1][2] = 'used' __services[2][2] = 'available'");
  addon.advance(1.1);
  expect(chatHas(addon, /Trained 1 skill\(s\) for 5s 0c\./), "rank 1 is gone from the list though rank 2 shares its name").toBe(true);
});

// TEST-ONLY merchant selling bread (90011) in purchases of 5; the bags take a purchase at once, timers are the client's.
const BREAD_MERCHANT = `
  __goods = { { id = 90011, price = 5, stack = 1, left = -1, max = 5 } }
  __have, __buys, __money = { [90011] = 5 }, {}, 100000
  GetMoney = function() return __money end
  GetMerchantNumItems = function() return #__goods end
  GetMerchantItemLink = function(i) return "|cffffffff|Hitem:" .. __goods[i].id .. "::|h[TEST-ONLY Bread]|h|r" end
  GetMerchantItemMaxStack = function(i) return __goods[i].max end
  C_MerchantFrame = { GetItemInfo = function(i) local g = __goods[i] return { price = g.price, stackCount = g.stack, numAvailable = g.left } end }
  BuyMerchantItem = function(i, n) local g = __goods[i] __buys[#__buys + 1] = n __have[g.id] = (__have[g.id] or 0) + n __money = __money - g.price * n end
  C_Item = { GetItemCount = function(id) return __have[id] or 0 end, GetItemInfo = function() return "TEST-ONLY Bread" end }
`;
// A Keep stocked run for 20 bread (5 carried) with the first chunk bought, then the list changed by `change` (Lua).
const runThenChange = (change) => {
  const addon = loggedIn(BREAD_MERCHANT, { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90011] = 20 } } } }" });
  addon.eval("VanguardCharDB.stockList = { [90011] = 20 }");
  addon.fire("MERCHANT_SHOW");
  addon.eval(change);
  addon.advance(3);
  return addon;
};

it("H44-23-101: clearing the Keep stocked list during a run stops the buying", () => {
  const addon = runThenChange("ns.GetModule('Errands').ClearStock()");
  expect(addon.eval("return __buys"), "the chunk already asked for arrived, nothing after the list went empty").toEqual([5]);
});

it("H44-23-101: lowering an amount during a run caps the buying at the new amount", () => {
  const addon = runThenChange("VanguardCharDB.stockList[90011] = 12");
  expect(addon.eval("return { __have[90011], __buys }"), "5 carried, 5 bought, then only 2 more to reach 12").toEqual([12, [5, 2]]);
});
