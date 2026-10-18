// petstable: Pet stable (Modules/PetStable.lua), /vg pets and the stable master's line, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

// The addon's chat prefix.
const P = "|cffe6b45bVanguard:|r ";
// TEST-ONLY stable: Rex is out (a happy, loyal cat a third of the way to level 13), Fang is stabled with hidden details.
const STABLE = `
  C_StableInfo = {
    GetActivePetList = function() return { { name = "TEST-ONLY Rex", level = 12, familyName = "Cat", loyaltyName = "Loyal", happinessLevel = 3, experience = 35, experienceNeeded = 100 } } end,
    GetStabledPetList = function() return { { name = { __secret = true }, level = 5, familyName = "", loyaltyName = "", happinessLevel = 9, experience = 1, experienceNeeded = 0 } } end,
    GetNextStableSlotCost = function() return 50000 end,
  }
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end`;

it("/vg pets lists the pet that is out, then the stabled ones, hiding what the game hides", () => {
  const addon = loggedIn(STABLE);
  addon.slash("pets");
  expect(Array.from(addon.chat()).slice(-3), "the heading, Rex out, then Fang with no name, family or loyalty").toEqual([
    P + "Your pets:", P + "TEST-ONLY Rex, level 12 Cat · Loyal · happy · 35% to next level (out)", P + "?, level 5 ?",
  ]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("a stable master's window says how many pets and the next slot's price, unless switched off", () => {
  const addon = loggedIn(STABLE);
  addon.fire("PET_STABLE_SHOW");
  expect(Array.from(addon.chat()).pop(), "two pets, 5g").toBe(P + "Stable: 2 pets (/vg pets lists them). Next slot: 5g 0s 0c.");
  addon.eval("C_StableInfo.GetActivePetList = function() return {} end C_StableInfo.GetNextStableSlotCost = nil");
  addon.slash("pets x");
  addon.fire("PET_STABLE_SHOW");
  expect(Array.from(addon.chat()).pop(), "one pet, no price").toBe(P + "Stable: 1 pet (/vg pets lists them).");
  addon.eval('ns.Settings("PetStable").announce = false C_StableInfo.GetStabledPetList = function() return {} end');
  addon.fire("PET_STABLE_SHOW");
  addon.slash("pets");
  expect(Array.from(addon.chat()).pop(), "off, and no pets: the command says so").toBe(P + "No pets to list (or the game doesn't list them here).");
  addon.eval("C_StableInfo = nil");
  addon.slash("pets");
  expect([Array.from(addon.chat()).pop(), addon.eval("return #ns.errors")], "no C_StableInfo: the same line, no error").toEqual([P + "No pets to list (or the game doesn't list them here).", 0]);
});
