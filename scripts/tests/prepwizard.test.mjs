// prepwizard: the wanted-amounts window of Instance prep (Modules/InstancePrepWizard.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { loggedIn, setCombat } from "./helpers.mjs";

// An empty Lua table comes back as an object: treat it as an empty list.
const list = (v) => (Array.isArray(v) ? v : []);
const WZ = "ns.GetModule('InstancePrep').Wizard";
// A wanted amount from the module's settings.
const want = (addon, key) => addon.eval(`return ns.GetModule('InstancePrep').settings.want.${key}`);
// The keys of the sliders on the page showing, sorted.
const shownSliders = (addon) => list(addon.eval(`local out = {}
  for key, s in pairs(${WZ}.frame.sliders) do if s:IsShown() then out[#out + 1] = key end end
  table.sort(out) return out`));
// Clicks one of the window's buttons by field name.
const click = (addon, name) => addon.eval(`${WZ}.frame.${name}:GetScript("OnClick")(${WZ}.frame.${name})`);
// The step the window is on.
const step = (addon) => addon.eval(`return ${WZ}.step`);

// A character of a class and level with the window open.
function open(cls, level) {
  const addon = loggedIn();
  addon.world.setUnit("player", { class: cls, level });
  addon.slash("prep setup");
  return addon;
}

it("prepwizard: a warrior has two steps, supplies then review, and Use suggested follows the level", () => {
  const addon = open("WARRIOR", 25);
  expect(addon.frame("Vanguard_PrepWizard").visible, "/vg prep setup opens it").toBe(true);
  expect(shownSliders(addon), "step 1: the three supplies").toEqual(["bandages", "food", "potions"]);
  click(addon, "suggest");
  expect([want(addon, "food"), want(addon, "bandages"), want(addon, "potions")], "level 25 suggestions").toEqual([20, 10, 3]);
  click(addon, "next");
  expect(shownSliders(addon), "step 2 is the review: no sliders").toEqual([]);
  expect(addon.eval(`return ${WZ}.frame.review:GetText():find("Food & drink: 20") ~= nil`), "it lists the amounts").toBe(true);
  click(addon, "back");
  expect(step(addon), "Back returns to step 1").toBe(1);
  click(addon, "next");
  click(addon, "next");
  expect(addon.frame("Vanguard_PrepWizard").visible, "Done closes it").toBe(false);
});

it("prepwizard: hunters and warlocks get a class step with their own amount", () => {
  const hunter = open("HUNTER", 60);
  click(hunter, "suggest");
  expect(want(hunter, "ammo"), "level 60 ammo").toBe(1000);
  click(hunter, "next");
  expect(shownSliders(hunter), "step 2: ammo").toEqual(["ammo"]);
  const lock = open("WARLOCK", 10);
  click(lock, "suggest");
  click(lock, "next");
  expect([shownSliders(lock), want(lock, "shards")], "shards at level 10").toEqual([["shards"], 5]);
});

it("prepwizard: a slider sets the wanted amount and the slash command still works", () => {
  const addon = open("WARRIOR", 60);
  addon.eval(`${WZ}.frame.sliders.food.set(45)`);
  expect(want(addon, "food"), "the slider writes the setting").toBe(45);
  addon.slash("prep want potions 7");
  expect(want(addon, "potions"), "/vg prep want").toBe(7);
});

it("prepwizard: waits for combat, and says when Instance prep is off", () => {
  const off = loggedIn();
  off.eval("ns.GetModule('InstancePrep').settings = nil");
  off.slash("prep setup");
  expect(off.chat().join("\n"), "off: a line in chat").toContain("Instance prep is off");
  const addon = loggedIn();
  setCombat(addon, true);
  addon.slash("prep setup");
  expect(addon.frame("Vanguard_PrepWizard"), "in combat it waits").toBe(null);
  setCombat(addon, false);
  expect(addon.frame("Vanguard_PrepWizard").visible, "it opens after the fight").toBe(true);
});
