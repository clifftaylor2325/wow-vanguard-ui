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
