// legacy: the Legacy probe and perk planner (Modules/Legacy.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

const PLANNER_ON = { savedVariables: "VanguardDB.profiles = { Default = { Legacy = { planner = true } } }" };

// The account's plan as [points, name] pairs.
const plan = (addon) => {
  const list = addon.eval("local out = {} for i, p in ipairs(ns.GetModule('Legacy').Plan()) do out[i] = { p.points, p.name } end return out");
  return Array.isArray(list) ? list : [];
};

it("the planner is off until switched on, and says so", () => {
  const addon = loggedIn("");
  addon.slash("legacy plan add 2 Swift Travel");
  expect([chatHas(addon, /The Legacy perk planner is off/), plan(addon)], "nothing is kept while it is off").toEqual([true, []]);
  addon.slash("legacy");
  expect(chatHas(addon, /\/vg legacy probe lists what the client has/), "bare /vg legacy says what there is").toBe(true);
});

it("plans perks within the 16 points: add, change, refuse, remove, clear", () => {
  const addon = loggedIn("", PLANNER_ON);
  addon.slash("legacy plan add 3 Swift Travel");
  addon.slash("legacy plan add 10 Deep Pockets");
  expect(plan(addon), "two perks, 13 points").toEqual([[3, "Swift Travel"], [10, "Deep Pockets"]]);
  addon.slash("legacy plan add 14 deep pockets");
  expect(chatHas(addon, /That makes 17 points; the tree has 16\./), "a change that would pass 16 is refused").toBe(true);
  addon.slash("legacy plan add 4 deep pockets");
  expect(plan(addon)[1], "the same perk in any case is changed, not doubled").toEqual([4, "Deep Pockets"]);
  addon.slash("legacy plan add 0 Nothing");
  addon.slash("legacy plan add x");
  expect([plan(addon).length, chatHas(addon, /Give a whole number of points/)], "no points, or no perk, is refused").toEqual([2, true]);
  addon.slash("legacy plan");
  expect(chatHas(addon, /7 of 16 points planned\./), "the list ends with the budget").toBe(true);
  addon.slash("legacy plan remove swift travel");
  addon.slash("legacy plan remove nothing here");
  expect([plan(addon), chatHas(addon, /No such perk in the plan\./), chatHas(addon, /Perk dropped\./)], "remove by name").toEqual([[[4, "Deep Pockets"]], true, true]);
  addon.slash("legacy plan clear");
  expect(plan(addon), "clear forgets the list").toEqual([]);
});

it("the probe lists the window, its pages, the perk panel and the Legacy globals", () => {
  const addon = loggedIn("");
  addon.slash("legacy probe");
  expect(chatHas(addon, /LegacySystemFrame is not loaded \(open the Legacy window once/), "no window yet").toBe(true);
  addon.eval(`LegacySystemFrame = { TreePage = { LegacyTreeTraitPanel = { configID = 7, treeID = 9 } }, ChallengesPage = { CategoryList = {}, DetailPane = {} } }
    C_Traits = { GetTreeNodes = function() return { 1, 2, 3 } end }`);
  addon.slash("legacy probe");
  expect(chatHas(addon, /TreePage: 1 keys: LegacyTreeTraitPanel/), "a page's keys").toBe(true);
  expect(chatHas(addon, /ChallengesPage: 2 keys: CategoryList, DetailPane/), "another page's keys").toBe(true);
  expect(chatHas(addon, /RewardTrackPage: missing/), "a missing page").toBe(true);
  expect(chatHas(addon, /perk panel: configID 7, treeID 9, nodes 3/), "the panel's ids and node count").toBe(true);
  expect(chatHas(addon, /globals with Legacy in the name \(\d+\): .*LegacySystemFrame \(table\)/), "the globals").toBe(true);
});

it("the probe copes with a window without a panel, secret ids, a failing tree call, and combat", () => {
  const addon = loggedIn("");
  addon.eval("LegacySystemFrame = { TreePage = {} }");
  addon.slash("legacy probe");
  expect(chatHas(addon, /perk panel: not found on TreePage/), "no panel").toBe(true);
  addon.eval("LegacySystemFrame.TreePage.LegacyTreeTraitPanel = { configID = __wfgWorld.secret(1), treeID = 9 } C_Traits = { GetTreeNodes = function() error('no tree') end }");
  addon.slash("legacy probe");
  expect(chatHas(addon, /perk panel: configID hidden, treeID 9, nodes unknown/), "hidden ids and a failing call").toBe(true);
  addon.eval("C_Traits = nil LegacySystemFrame.TreePage.LegacyTreeTraitPanel.treeID = nil");
  addon.slash("legacy probe");
  expect(chatHas(addon, /treeID nil|treeID table|nodes unknown/), "no trait calls").toBe(true);
  addon.world.combat(true);
  addon.slash("legacy probe");
  expect(chatHas(addon, /Not in combat\./), "nothing is read in combat").toBe(true);
});
