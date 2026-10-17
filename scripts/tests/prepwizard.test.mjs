// prepwizard: the wanted-amounts window of Instance prep (Modules/InstancePrepWizard.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { isTok, loggedIn, px, setCombat } from "./helpers.mjs";
import { alphaOf, buttonOf, closeOf, escapes, insets, pressEscape, titleOf, titleSize } from "./dialogs.mjs";

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
  const wizard = "Vanguard_PrepWizard";
  expect(titleOf(addon, wizard), "a window title: the title role in the text colour, T.SPACE.pad in, on the close button's line").toEqual({ size: titleSize(addon), text: true, left: 16, mid: -24 });
  expect(closeOf(addon, wizard), "with the X where every window has it (the one ns.Dialog makes)").toEqual([px(addon, 24), px(addon, 24), true]);
  expect([addon.eval(`return ${wizard}.close == ${wizard}.chrome.close`), addon.frames(`w.__kind == "Button" and w:GetParent() == ${wizard} and w.__points.CENTER ~= nil and w.__points.CENTER.relPoint == "TOPRIGHT"`).length], "and no second one of its own").toEqual([true, 1]);
  expect([escapes(addon, wizard), alphaOf(addon, wizard), addon.eval("local n = 0 for _, name in ipairs(UISpecialFrames) do if name == 'Vanguard_PrepWizard' then n = n + 1 end end return n")], "Escape closes it, once on the list; the dialog alpha").toEqual([true, 0.98, 1]);
  const caption = addon.frame(`${wizard}.caption`);
  expect([caption.text, caption.font.size, isTok(addon, caption.textColor, "muted"), insets(addon, `${wizard}.caption`, wizard).slice(0, 2)], "the step caption is a note: small muted, T.SPACE.pad in, under the head").toEqual(["Step 1 of 2", addon.eval("return ns.Theme.RoleSize('small')"), true, [16, 40]]);
  const food = insets(addon, `${wizard}.sliders.food`, wizard), bandages = insets(addon, `${wizard}.sliders.bandages`, wizard);
  expect([food[0], food[1], bandages[1] - food[1], addon.eval(`return { ${wizard}.sliders.food:GetWidth(), ${wizard}.sliders.food:GetHeight() }`)], "the sliders start at T.SPACE.pad, under the caption, stacked one list row (28) apart, the window's width less two pads").toEqual([16, 56, 28, [368, 28]]);
  expect([buttonOf(addon, `${wizard}.suggest`), buttonOf(addon, `${wizard}.next`), insets(addon, `${wizard}.next`, wizard).slice(2)], "Use suggested is plain and Next the one accent button, both standalone and 120 wide, a pad from the corner").toEqual([[false, "Use suggested", 26, 120], [true, "Next", 26, 120], [16, 16]]);
  click(addon, "suggest");
  expect([want(addon, "food"), want(addon, "bandages"), want(addon, "potions")], "level 25 suggestions").toEqual([20, 10, 3]);
  click(addon, "next");
  expect(shownSliders(addon), "step 2 is the review: no sliders").toEqual([]);
  expect(addon.eval(`return ${WZ}.frame.review:GetText():find("Food & drink: 20") ~= nil`), "it lists the amounts").toBe(true);
  click(addon, "back");
  expect(step(addon), "Back returns to step 1").toBe(1);
  expect(addon.eval(`return ${WZ}.frame.review:GetTop() - ${WZ}.frame:GetTop()`), "the review text starts where the sliders did").toBe(-56);
  click(addon, "next");
  expect([addon.eval(`return ${WZ}.frame.next.text:GetText()`), buttonOf(addon, `${WZ}.frame.next`)[0]], "the last step ends in Done, still the accent button").toEqual(["Done", true]);
  click(addon, "next");
  expect(addon.frame("Vanguard_PrepWizard").visible, "Done closes it").toBe(false);
  addon.slash("prep setup");
  addon.click("Vanguard_PrepWizard.chrome.close");
  expect(addon.frame("Vanguard_PrepWizard").visible, "so does the X").toBe(false);
  addon.slash("prep setup");
  pressEscape(addon);
  expect(addon.frame("Vanguard_PrepWizard").visible, "and Escape").toBe(false);
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
